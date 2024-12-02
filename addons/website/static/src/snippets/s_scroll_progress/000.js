
import publicWidget from "@web/legacy/js/public/public_widget";
import { throttleForAnimation } from "@web/core/utils/timing";

const ScrollProgress = publicWidget.Widget.extend({
    selector: '.s_scroll_progress',

    start() {
        document.querySelector('header').appendChild(this.el);

        this.__onScroll = throttleForAnimation(this._onScroll.bind(this));
        document.addEventListener('scroll', this.__onScroll);

        return this._super(...arguments);
    },

    destroy() {
        document.querySelector('main #wrap').prepend(this.el);

        document.removeEventListener('scroll', this.__onScroll);

        this.el.querySelector('.s_scroll_progress_bar').style.width = '';

        return this._super(...arguments);
    },

    _onScroll() {
        const currentScroll = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
        this.el.querySelector('.s_scroll_progress_bar').style.width = `${currentScroll * 100}%`;
    },
});

publicWidget.registry.ScrollProgress = ScrollProgress;
