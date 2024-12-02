
import publicWidget from "@web/legacy/js/public/public_widget";
import { throttleForAnimation } from "@web/core/utils/timing";

const ScrollProgress = publicWidget.Widget.extend({
    selector: '.s_scroll_progress',
    disabledInEditableMode: false,

    start() {
        this.options.wysiwyg?.odooEditor.observerUnactive();
        if (!this.el.dataset.position) {
            document.querySelector('header').appendChild(this.el);
        } else {
            this.el.classList.add('fixed-bottom');
        }
        this.options.wysiwyg?.odooEditor.observerActive();

        this.__onScroll = throttleForAnimation(this._onScroll.bind(this));
        document.addEventListener('scroll', this.__onScroll);

        // Make sure to handle the initial scroll (may not be 0 on editor start
        // or when applying a new position).
        this._onScroll();

        return this._super(...arguments);
    },

    destroy() {
        this.options.wysiwyg?.odooEditor.observerUnactive();
        document.querySelector('main #wrap').prepend(this.el);
        this.el.classList.remove('fixed-bottom');

        document.removeEventListener('scroll', this.__onScroll);

        this.el.querySelector('.s_scroll_progress_bar').style.width = '';
        this.options.wysiwyg?.odooEditor.observerActive();

        return this._super(...arguments);
    },

    _onScroll() {
        const currentScroll = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
        this.el.querySelector('.s_scroll_progress_bar').style.width = `${currentScroll * 100}%`;
    },
});

publicWidget.registry.ScrollProgress = ScrollProgress;
