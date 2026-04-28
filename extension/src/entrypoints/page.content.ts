import { currentPageDelegate } from '@/services/pages';
import type { ContentScriptContext } from '#imports';

const excludeGlobs = [
    '*://killergerbah.github.io/asbplayer*',
    '*://app.asbplayer.dev/*',
    'https://bearkidsteam.github.io/asbplayer*',
    'http://localhost:5173/asbplayer*',
];

if (import.meta.env.DEV) {
    excludeGlobs.push('*://localhost:3000/*');
}

export default defineContentScript({
    // Set manifest options
    matches: ['<all_urls>'],
    excludeGlobs,
    allFrames: true,
    runAt: 'document_start',

    main(ctx: ContentScriptContext) {
        currentPageDelegate().then((pageDelegate) => pageDelegate?.loadScripts());
    },
});
