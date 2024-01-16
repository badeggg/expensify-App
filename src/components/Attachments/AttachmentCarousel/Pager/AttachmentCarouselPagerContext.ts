import type {ForwardedRef} from 'react';
import {createContext} from 'react';
import type PagerView from 'react-native-pager-view';
import type {SharedValue} from 'react-native-reanimated';

type AttachmentCarouselPagerContextValue = {
    onTap: () => void;
    onScaleChanged: (scale: number) => void;
    pagerRef: ForwardedRef<PagerView>; //
    isPagerSwiping: SharedValue<boolean>;
};

const AttachmentCarouselPagerContext = createContext<AttachmentCarouselPagerContextValue | null>(null);

export default AttachmentCarouselPagerContext;
export type {AttachmentCarouselPagerContextValue};
