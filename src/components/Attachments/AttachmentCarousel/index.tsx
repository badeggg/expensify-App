import isEqual from 'lodash/isEqual';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ListRenderItemInfo} from 'react-native';
import {FlatList, Keyboard, PixelRatio, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {withOnyx} from 'react-native-onyx';
import {Easing, ReduceMotion, useAnimatedReaction, useSharedValue, withTiming} from 'react-native-reanimated';
import type {Attachment, AttachmentSource} from '@components/Attachments/types';
import BlockingView from '@components/BlockingViews/BlockingView';
import * as Illustrations from '@components/Icon/Illustrations';
import {useFullScreenContext} from '@components/VideoPlayerContexts/FullScreenContext';
import useLocalize from '@hooks/useLocalize';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import * as DeviceCapabilities from '@libs/DeviceCapabilities';
import Navigation from '@libs/Navigation/Navigation';
import variables from '@styles/variables';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import AttachmentCarouselCellRenderer from './AttachmentCarouselCellRenderer';
import CarouselActions from './CarouselActions';
import CarouselButtons from './CarouselButtons';
import CarouselItem from './CarouselItem';
import extractAttachmentsFromReport from './extractAttachmentsFromReport';
import AttachmentCarouselPagerContext from './Pager/AttachmentCarouselPagerContext';
import type {AttachmentCaraouselOnyxProps, AttachmentCarouselProps, UpdatePageProps} from './types';
import useCarouselArrows from './useCarouselArrows';

const viewabilityConfig = {
    // To facilitate paging through the attachments, we want to consider an item "viewable" when it is
    // more than 95% visible. When that happens we update the page index in the state.
    itemVisiblePercentThreshold: 95,
};

function AttachmentCarousel({report, reportActions, parentReportActions, source, onNavigate, setDownloadButtonVisibility, onClose}: AttachmentCarouselProps) {
    const theme = useTheme();
    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const {isFullScreenRef} = useFullScreenContext();
    const scrollRef = useRef<FlatList>(null);

    const canUseTouchScreen = DeviceCapabilities.canUseTouchScreen();

    const [containerWidth, setContainerWidth] = useState(0);
    const [page, setPage] = useState(0); // todo maintain this
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [activeSource, setActiveSource] = useState<AttachmentSource | null>(source);
    const {shouldShowArrows, setShouldShowArrows, autoHideArrows, cancelAutoHideArrows} = useCarouselArrows();

    const compareImage = useCallback((attachment: Attachment) => attachment.source === source, [source]);

    const offsetX = useSharedValue<number>(0);

    /** The `pagerItems` object that passed down to the context. Later used to detect current page, whether it's a single image gallery etc. */
    const pagerItems = useMemo(() => attachments.map((item, index) => ({source: item.source, index, isActive: index === page})), [page, attachments]);
    const isPagerScrolling = useSharedValue(false);
    const isScrollEnabled = useSharedValue(canUseTouchScreen);
    const scale = useRef(1);

    // Used to determine whether to activate pan gesture
    const firstTouch = useSharedValue<{x: number; y: number} | null>(null);
    const secondTouch = useSharedValue<{x: number; y: number} | null>(null);
    const panGestureActive = useSharedValue<boolean>(false);

    const translationX = useSharedValue<number>(0);
    const translationY = useSharedValue<number>(0);
    const velocityX = useSharedValue<number>(0);
    const velocityY = useSharedValue<number>(0);

    useEffect(() => {
        const parentReportAction = report.parentReportActionID && parentReportActions ? parentReportActions[report.parentReportActionID] : undefined;
        const attachmentsFromReport = extractAttachmentsFromReport(parentReportAction, reportActions ?? undefined);

        if (isEqual(attachments, attachmentsFromReport)) {
            return;
        }

        const initialPage = attachmentsFromReport.findIndex(compareImage);

        // Dismiss the modal when deleting an attachment during its display in preview.
        if (initialPage === -1 && attachments.find(compareImage)) {
            Navigation.dismissModal();
        } else {
            setPage(initialPage);
            setAttachments(attachmentsFromReport);

            // Update the download button visibility in the parent modal
            if (setDownloadButtonVisibility) {
                setDownloadButtonVisibility(initialPage !== -1);
            }

            // Update the parent modal's state with the source and name from the mapped attachments
            if (attachmentsFromReport[initialPage] !== undefined && onNavigate) {
                onNavigate(attachmentsFromReport[initialPage]);
            }
        }
    }, [reportActions, parentReportActions, compareImage, report.parentReportActionID, attachments, setDownloadButtonVisibility, onNavigate]);

    /** Updates the page state when the user navigates between attachments */
    const updatePage = useCallback(
        ({viewableItems}: UpdatePageProps) => {
            if (isFullScreenRef.current) {
                return;
            }

            Keyboard.dismiss();

            // Since we can have only one item in view at a time, we can use the first item in the array
            // to get the index of the current page
            const entry = viewableItems[0];
            if (!entry) {
                setActiveSource(null);
                return;
            }

            if (entry.index !== null) {
                setPage(entry.index);
                setActiveSource(entry.item.source);
            }

            if (onNavigate) {
                onNavigate(entry.item);
            }
        },
        [isFullScreenRef, onNavigate],
    );

    /** Increments or decrements the index to get another selected item */
    // todo to continue useAnimatedReaction
    const cycleThroughAttachments = useCallback(
        (deltaSlide: number) => {
            if (isFullScreenRef.current) {
                return;
            }

            const nextIndex = page + deltaSlide;
            const nextItem = attachments[nextIndex];

            if (!nextItem || !scrollRef.current) {
                return;
            }

            offsetX.value = containerWidth * page;
            offsetX.value = withTiming(
                containerWidth * nextIndex,
                {
                    duration: 300,
                    easing: Easing.inOut(Easing.quad),
                    reduceMotion: ReduceMotion.System,
                },
                () => {
                    setPage(nextIndex);
                    isPagerScrolling.value = false;
                },
            );
        },
        [attachments, containerWidth, isFullScreenRef, isPagerScrolling, offsetX, page],
    );

    const gotoAttachments = useCallback(
        (deltaSlide: number) => {
            if (isFullScreenRef.current) {
                return;
            }

            const nextIndex = page + deltaSlide;
            const nextItem = attachments[nextIndex];

            if (!nextItem || !scrollRef.current) {
                return;
            }

            offsetX.value = withTiming(
                containerWidth * nextIndex,
                {
                    duration: 300,
                    easing: Easing.out(Easing.quad),
                    reduceMotion: ReduceMotion.System,
                },
                () => {
                    setPage(nextIndex);
                    isPagerScrolling.value = false;
                },
            );
        },
        [attachments, containerWidth, isFullScreenRef, isPagerScrolling, offsetX, page],
    );

    useAnimatedReaction(
        () => offsetX.value,
        (currentValue) => {
            if (!scrollRef.current) {
                return;
            }
            scrollRef.current.scrollToOffset({offset: currentValue, animated: false});
        },
    );

    const extractItemKey = useCallback(
        (item: Attachment, index: number) =>
            typeof item.source === 'string' || typeof item.source === 'number' ? `source-${item.source}` : `reportActionID-${item.reportActionID}` ?? `index-${index}`,
        [],
    );

    /** Calculate items layout information to optimize scrolling performance */
    const getItemLayout = useCallback(
        (data: ArrayLike<Attachment> | null | undefined, index: number) => ({
            length: containerWidth,
            offset: containerWidth * index,
            index,
        }),
        [containerWidth],
    );

    const toggleArrows = useCallback(
        (showArrows?: boolean) => {
            if (showArrows === undefined) {
                setShouldShowArrows((prevShouldShowArrows) => !prevShouldShowArrows);
                return;
            }

            setShouldShowArrows(showArrows);
        },
        [setShouldShowArrows],
    );

    /** Defines how a single attachment should be rendered */
    const renderItem = useCallback(
        ({item}: ListRenderItemInfo<Attachment>) => (
            <CarouselItem
                item={item}
                isFocused={activeSource === item.source}
                isModalHovered={shouldShowArrows}
            />
        ),
        [activeSource, shouldShowArrows],
    );

    const handleTap = useCallback(() => {
        if (!isScrollEnabled.value) {
            return;
        }

        toggleArrows();
    }, [isScrollEnabled.value, toggleArrows]);

    const handleScaleChange = useCallback(
        (newScale: number) => {
            if (newScale === scale.current) {
                return;
            }

            scale.current = newScale;

            const newIsScrollEnabled = newScale === 1 && canUseTouchScreen;
            if (isScrollEnabled.value === newIsScrollEnabled) {
                return;
            }

            isScrollEnabled.value = newIsScrollEnabled;
            toggleArrows(newIsScrollEnabled);
        },
        [canUseTouchScreen, isScrollEnabled, toggleArrows],
    );

    const panGestureRef = useRef(Gesture.Pan());

    // Unable to make FlatList to be part of react-native-gesture-handler's gesture system.
    // So we have to do scrolling by self.
    const panGesture = Gesture.Pan()
        // 'manualActivation' not working on mWeb, react-native-gesture-handler version 2.14.1.
        // Later versions(2.15.0, 2.16.0, 2.16.1, 2.16.2) lead to ios build crash.
        .manualActivation(true)
        .enabled(true)
        .averageTouches(true)
        .onTouchesMove((evt, state) => {
            // determine whether to active pan gesture

            if (isPagerScrolling.value) {
                return;
            }

            if (panGestureActive.value) {
                return;
            }

            if (firstTouch.value && secondTouch.value) {
                return;
            }

            // Allow panning when the content is zoomed out
            if (scale.current < 1) {
                panGestureActive.value = true;
                state.activate();
                return;
            }

            if (!firstTouch.value) {
                // react-native-gesture-handler@2.14.1 may not reporting 'allTouches' correctly
                // on web, stale touch may exist.
                firstTouch.value = {
                    x: evt.allTouches.slice(-1)[0].x,
                    y: evt.allTouches.slice(-1)[0].y,
                };
            } else if (!secondTouch.value) {
                secondTouch.value = {
                    x: evt.allTouches.slice(-1)[0].x,
                    y: evt.allTouches.slice(-1)[0].y,
                };
            }

            if (scale.current === 1 && firstTouch.value && secondTouch.value) {
                const deltaX = Math.abs(secondTouch.value.x - firstTouch.value.x);
                const deltaY = Math.abs(secondTouch.value.y - firstTouch.value.y);

                if (deltaY < deltaX) {
                    panGestureActive.value = true;
                    state.activate();
                }
            }
        })
        .onUpdate((evt) => {
            if (!panGestureActive.value) {
                return;
            }

            if (!containerWidth) {
                return;
            }
            if (!scrollRef.current) {
                return;
            }

            const offset = containerWidth * page - evt.translationX;
            if (offset < 0 || offset > containerWidth * (attachments.length - 1)) {
                return;
            }
            offsetX.value = offset;
            isPagerScrolling.value = true;

            translationX.value = evt.translationX;
            translationY.value = evt.translationY;
            velocityX.value = evt.velocityX;
            velocityY.value = evt.velocityY;
        })
        .onTouchesUp(() => {
            // todo to check usePanGesture
            firstTouch.value = null;
            secondTouch.value = null;

            if (!panGestureActive.value) {
                return;
            }

            if (isPagerScrolling.value) {
                if (Math.abs(translationX.value) > containerWidth / 3 || Math.abs(velocityX.value) > 100) {
                    if (translationX.value > 0) {
                        gotoAttachments(-1);
                    } else {
                        gotoAttachments(1);
                    }
                } else {
                    gotoAttachments(0);
                }
            }

            panGestureActive.value = false;
            translationX.value = 0;
            translationY.value = 0;
            velocityX.value = 0;
            velocityY.value = 0;
        })
        .withRef(panGestureRef);

    const contextValue = useMemo(
        () => ({
            pagerItems,
            activePage: page,
            isPagerScrolling,
            isScrollEnabled,
            pagerRef: panGestureRef,
            onTap: handleTap,
            onSwipeDown: onClose,
            onScaleChanged: handleScaleChange,
        }),
        [pagerItems, page, isPagerScrolling, isScrollEnabled, handleTap, onClose, handleScaleChange],
    );

    return (
        <View
            style={[styles.flex1, styles.attachmentCarouselContainer]}
            onLayout={({nativeEvent}) => {
                if (isFullScreenRef.current) {
                    return;
                }
                setContainerWidth(PixelRatio.roundToNearestPixel(nativeEvent.layout.width));
            }}
            onMouseEnter={() => !canUseTouchScreen && setShouldShowArrows(true)}
            onMouseLeave={() => !canUseTouchScreen && setShouldShowArrows(false)}
        >
            {page === -1 ? (
                <BlockingView
                    icon={Illustrations.ToddBehindCloud}
                    iconColor={theme.offline}
                    iconWidth={variables.modalTopIconWidth}
                    iconHeight={variables.modalTopIconHeight}
                    title={translate('notFound.notHere')}
                />
            ) : (
                <>
                    <CarouselButtons
                        shouldShowArrows={shouldShowArrows}
                        page={page}
                        attachments={attachments}
                        onBack={() => cycleThroughAttachments(-1)}
                        onForward={() => cycleThroughAttachments(1)}
                        autoHideArrow={autoHideArrows}
                        cancelAutoHideArrow={cancelAutoHideArrows}
                    />

                    {containerWidth > 0 && (
                        <AttachmentCarouselPagerContext.Provider value={contextValue}>
                            <GestureDetector gesture={panGesture}>
                                <FlatList
                                    keyboardShouldPersistTaps="handled"
                                    horizontal
                                    decelerationRate="fast"
                                    showsHorizontalScrollIndicator={false}
                                    bounces={false}
                                    // Scroll only one image at a time no matter how fast the user swipes
                                    disableIntervalMomentum
                                    ref={scrollRef}
                                    initialScrollIndex={page}
                                    initialNumToRender={3}
                                    windowSize={5}
                                    maxToRenderPerBatch={CONST.MAX_TO_RENDER_PER_BATCH.CAROUSEL}
                                    data={attachments}
                                    CellRendererComponent={AttachmentCarouselCellRenderer}
                                    renderItem={renderItem}
                                    getItemLayout={getItemLayout}
                                    keyExtractor={extractItemKey}
                                    viewabilityConfig={viewabilityConfig}
                                    onViewableItemsChanged={updatePage}
                                />
                            </GestureDetector>
                        </AttachmentCarouselPagerContext.Provider>
                    )}

                    <CarouselActions onCycleThroughAttachments={cycleThroughAttachments} />
                </>
            )}
        </View>
    );
}

AttachmentCarousel.displayName = 'AttachmentCarousel';

export default withOnyx<AttachmentCarouselProps, AttachmentCaraouselOnyxProps>({
    parentReportActions: {
        key: ({report}) => `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${report.parentReportID}`,
        canEvict: false,
    },
    reportActions: {
        key: ({report}) => `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${report.reportID}`,
        canEvict: false,
    },
})(AttachmentCarousel);
