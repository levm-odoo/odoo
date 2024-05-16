odoo.define('website.s_image_gallery_options', function (require) {
'use strict';

const { MediaDialogWrapper } = require('@web_editor/components/media_dialog/media_dialog');
const { ComponentWrapper } = require('web.OwlCompatibility');
var core = require('web.core');
var options = require('web_editor.snippets.options');
const wUtils = require("website.utils");

var _t = core._t;
var qweb = core.qweb;

options.registry.gallery = options.Class.extend({
    /**
     * @override
     */
    start: function () {
        var self = this;
        // TODO In master: define distinct classes.
        // Differentiate both instances of this class: we want to avoid
        // registering the same event listener twice.
        this.hasAddImages = this.el.querySelector("we-button[data-add-images]");

        if (!this.hasAddImages) {
            let layoutPromise;
            const containerEl = this.$target[0].querySelector(":scope > .container, :scope > .container-fluid, :scope > .o_container_small");
            if (containerEl.querySelector(":scope > *:not(div)")) {
                layoutPromise = self._modeWithImageWait(null, self.getMode());
            } else {
                layoutPromise = Promise.resolve();
            }
            return layoutPromise.then(this._super.apply(this, arguments));
        }

        // Manage the media replacement. Make sure the data-index attribute and
        // the media previews are updated if medias are changed.
        // TODO init_media_dialog is not triggered anymore
        this.$target.on("init_media_dialog.gallery", async (_, data) => {
            // Prevent registering the replace media step. It will be registered
            // manually once everything is updated, to have only one big step.
            this.options.wysiwyg.odooEditor.historyPauseSteps();

            // Save the media data-index to set it on the new one afterwards.
            this.savedIndex = data.mediaEl.dataset.index;
            // Only allow images and videos in the media dialog.
            data.options.noIcons = true;
            data.options.noDocuments = true;
            // Make sure the steps are unpaused when closing the dialog.
            data.options.onClose = () => this.options.wysiwyg.odooEditor.historyUnpauseSteps();
        });
        // TODO replace_target is not triggered anymore
        this.$target.on("replace_target.gallery", "img, .media_iframe_video", async (_, mediaEl) => {
            // Set the data-index attribute.
            mediaEl.dataset.index = this.savedIndex;
            // Update the previews.
            const indicatorEl = this.$target[0].querySelector(`[data-slide-to="${this.savedIndex}"]`);
            if (indicatorEl) {
                indicatorEl.replaceChildren();
                indicatorEl.classList.remove("o_not_editable");
                if (mediaEl.tagName === "IMG") {
                    indicatorEl.style.backgroundImage = `url(${mediaEl.getAttribute("src")})`;
                } else if (mediaEl.classList.contains("media_iframe_video")) {
                    // Update the carousel indicator with the video thumbnail.
                    const src = await this._getVideoThumbnailSrc(mediaEl.dataset.oeExpression)
                        || "/web/static/img/placeholder.png";
                    indicatorEl.style.backgroundImage = `url(${src})`;
                    this._addVideoPlayIcon(indicatorEl);
                }
            }
            // Register the replace media step.
            this.options.wysiwyg.odooEditor.historyStep();
            this.trigger_up("activate_snippet", {$snippet: $(mediaEl), ifInactiveOptions: true});
        });

        // When the snippet is empty, an edition button is the default content
        // TODO find a nicer way to do that to have editor style
        this.$target.on('click.gallery', '.o_add_images', function (e) {
            e.stopImmediatePropagation();
            self.addImages(false);
        });

        this.$target.on('dropped.gallery', 'img', function (ev) {
            self.mode(null, self.getMode());
            if (!ev.target.height) {
                $(ev.target).one('load', function () {
                    setTimeout(function () {
                        self.trigger_up('cover_update');
                    });
                });
            }
        });

        // If some medias do not have the `data-index` attribute, reset the mode
        // so everything is consistent. (Needed for already dropped snippets
        // whose images have been previously replaced by other media types).
        const mediaEls = this._getImages();
        const indexedMediaEls = this.$target[0].querySelectorAll("[data-index]");
        if (mediaEls.length !== indexedMediaEls.length) {
            this.options.wysiwyg.odooEditor.observerUnactive("resetMode");
            return this.mode("reset", this.getMode()).then(() => {
                this.options.wysiwyg.odooEditor.observerActive("resetMode");
            }).then(this._super.apply(this, arguments));
        }

        return this._super.apply(this, arguments).then(() => {
            // Call specific mode's start if defined (e.g. _slideshowStart)
            const startMode = this[`_${this.getMode()}Start`];
            if (startMode) {
                startMode.bind(this)();
            }
        });
    },
    /**
     * @override
     */
    onBuilt: function () {
        if (this.$target.find('.o_add_images').length) {
            this.addImages(false);
        }
        // TODO should consider the async parts
        this._adaptNavigationIDs();
    },
    /**
     * @override
     */
    onClone: function () {
        this._adaptNavigationIDs();
    },
    /**
     * @override
     */
    cleanForSave: function () {
        if (this.$target.hasClass('slideshow')) {
            this.$target.removeAttr('style');
        }
    },
    /**
     * @override
     */
    destroy() {
        this._super(...arguments);
        this.$target.off('.gallery');
    },

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Allows to select images to add as part of the snippet.
     *
     * @see this.selectClass for parameters
     */
    addImages: function (previewMode) {
        const $images = this.$('img');
        var $container = this.$('> .container, > .container-fluid, > .o_container_small');
        const mediaEls = this._getImages();
        const lastMediaEl = mediaEls[mediaEls.length - 1];
        let index = lastMediaEl ? this._getIndex(lastMediaEl) : -1;
        const dialog = new ComponentWrapper(this, MediaDialogWrapper, {
            multiImages: true,
            onlyImages: true,
            save: images => {
                // TODO In master: restore addImages Promise result.
                this.trigger_up('snippet_edition_request', {exec: () => {
                    for (const image of images) {
                        $('<img/>', {
                            class: $images.length > 0 ? $images[0].className : 'img img-fluid d-block ',
                            src: image.src,
                            'data-index': ++index,
                            alt: image.alt || '',
                            'data-name': _t('Image'),
                            style: $images.length > 0 ? $images[0].style.cssText : '',
                        }).appendTo($container);
                    }
                    if (images.length > 0) {
                        return this._modeWithImageWait('reset', this.getMode()).then(() => {
                            this.trigger_up('cover_update');
                        });
                    }
                }});
            },
        });
        dialog.mount(this.el);
    },
    /**
     * Allows to change the number of columns when displaying images with a
     * grid-like layout.
     *
     * @see this.selectClass for parameters
     */
    columns: function (previewMode, widgetValue, params) {
        const nbColumns = parseInt(widgetValue || '1');
        this.$target.attr('data-columns', nbColumns);

        // TODO In master return mode's result.
        this.mode(previewMode, this.getMode(), {}); // TODO improve
    },
    /**
     * Get the image target's layout mode (slideshow, masonry, grid or nomode).
     *
     * @returns {String('slideshow'|'masonry'|'grid'|'nomode')}
     */
    getMode: function () {
        var mode = 'slideshow';
        if (this.$target.hasClass('o_masonry')) {
            mode = 'masonry';
        }
        if (this.$target.hasClass('o_grid')) {
            mode = 'grid';
        }
        if (this.$target.hasClass('o_nomode')) {
            mode = 'nomode';
        }
        return mode;
    },
    /**
     * Displays the medias with the "grid" layout.
     */
    grid: function () {
        const mediaEls = this._getImages();
        const mediaHolderEls = this._getImgHolderEls();
        var $row = $('<div/>', {class: 'row s_nb_column_fixed'});
        var columns = this._getColumns();
        var colClass = 'col-lg-' + (12 / columns);
        var $container = this._replaceContent($row);

        mediaHolderEls.forEach((mediaHolderEl, index) => {
            const $mediaHolder = $(mediaHolderEl);
            var $col = $('<div/>', {class: colClass});
            $col.append($mediaHolder).appendTo($row);
            if ((index + 1) % columns === 0) {
                $row = $('<div/>', {class: 'row s_nb_column_fixed'});
                $row.appendTo($container);
            }
            // Set the data-index (to always have the right order).
            mediaEls[index].setAttribute("data-index", index);
        });
        this.$target.css('height', '');
    },
    /**
     * Displays the medias with the "masonry" layout.
     */
    masonry: function () {
        var self = this;
        const mediaEls = this._getImages();
        const mediaHolderEls = this._getImgHolderEls();
        var columns = this._getColumns();
        var colClass = 'col-lg-' + (12 / columns);
        var cols = [];

        var $row = $('<div/>', {class: 'row s_nb_column_fixed'});
        this._replaceContent($row);

        // Create columns
        for (var c = 0; c < columns; c++) {
            var $col = $('<div/>', {class: 'o_masonry_col o_snippet_not_selectable ' + colClass});
            $row.append($col);
            cols.push($col[0]);
        }

        // Dispatch medias in columns by always putting the next one in the
        // smallest-height column
        if (this._masonryAwaitImages) {
            // TODO In master return promise.
            this._masonryAwaitImagesPromise = new Promise(async resolve => {
                let index = 0;
                for (const mediaHolderEl of mediaHolderEls) {
                    let min = Infinity;
                    let smallestColEl;
                    for (const colEl of cols) {
                        const colMediaEls = this._getAllMediaEls(colEl);
                        const lastMediaRect = colMediaEls.length && colMediaEls[colMediaEls.length - 1].getBoundingClientRect();
                        const height = lastMediaRect ? Math.round(lastMediaRect.top + lastMediaRect.height) : 0;
                        if (height < min) {
                            min = height;
                            smallestColEl = colEl;
                        }
                    }
                    smallestColEl.append(mediaHolderEl);
                    // Set the data-index (to always have the right order).
                    mediaEls[index].setAttribute("data-index", index++);
                    await wUtils.onceAllImagesLoaded(this.$target);
                }
                resolve();
            });
            return;
        }
        // TODO Remove in master.
        // Order might be wrong if images were not loaded yet.
        let index = 0;
        while (mediaHolderEls.length) {
            var min = Infinity;
            var $lowest;
            _.each(cols, function (col) {
                var $col = $(col);
                const colMediaEls = self._getAllMediaEls(col);
                let height = 0;
                if (colMediaEls.length) {
                    const lastMediaRect = colMediaEls[colMediaEls.length - 1].getBoundingClientRect();
                    height = lastMediaRect.top + lastMediaRect.height - self.$target[0].getBoundingClientRect().top;
                }
                // Neutralize invisible sub-pixel height differences.
                height = Math.round(height);
                if (height < min) {
                    min = height;
                    $lowest = $col;
                }
            });
            $lowest.append(mediaHolderEls.shift());
            // Set the data-index (to always have the right order).
            mediaEls[index].setAttribute("data-index", index++);
        }
    },
    /**
     * Allows to change the medias layout. @see grid, masonry, nomode, slideshow
     *
     * @see this.selectClass for parameters
     */
    mode: async function (previewMode, widgetValue, params) {
        widgetValue = widgetValue || 'slideshow'; // FIXME should not be needed
        this.$target.css('height', '');
        this.$target
            .removeClass('o_nomode o_masonry o_grid o_slideshow')
            .addClass('o_' + widgetValue);
        // Used to prevent the editor's "unbreakable protection mechanism" from
        // restoring Image Wall adaptations (images removed > new images added
        // to the container & layout updates) when adding new images to the
        // snippet.
        if (this.options.wysiwyg) {
            this.options.wysiwyg.odooEditor.unbreakableStepUnactive();
        }
        // The slideshow is async because of the rpc calls to get the video
        // thumbnails.
        await this[widgetValue]();
        this.trigger_up('cover_update');
        this._refreshPublicWidgets();
    },
    /**
     * Displays the medias with the standard layout: floating medias.
     */
    nomode: function () {
        var $row = $('<div/>', {class: 'row s_nb_column_fixed'});
        const mediaEls = this._getImages();
        const mediaHolderEls = this._getImgHolderEls();

        this._replaceContent($row);

        mediaEls.forEach((mediaEl, index) => {
            var wrapClass = 'col-lg-3';
            if (mediaEl.width >= mediaEl.height * 2 || mediaEl.width > 600
                    || mediaEl.classList.contains("media_iframe_video")) {
                wrapClass = 'col-lg-6';
            }
            // Set the data-index (to always have the right order).
            mediaEl.setAttribute("data-index", index);
            const $wrap = $('<div/>', {class: wrapClass}).append(mediaHolderEls[index]);
            $row.append($wrap);
        });
    },
    /**
     * Allows to remove all images. Restores the snippet to the way it was when
     * it was added in the page.
     *
     * @see this.selectClass for parameters
     */
    removeAllImages: function (previewMode) {
        var $addImg = $('<div>', {
            class: 'alert alert-info css_non_editable_mode_hidden text-center',
        });
        var $text = $('<span>', {
            class: 'o_add_images',
            style: 'cursor: pointer;',
            text: _t(" Add Images"),
        });
        var $icon = $('<i>', {
            class: ' fa fa-plus-circle',
        });
        this._replaceContent($addImg.append($icon).append($text));
    },
    /**
     * Displays the medias with a "slideshow" layout.
     */
    slideshow: async function () {
        const imageEls = this.$target[0].querySelectorAll("img");
        const mediaEls = this._getImages();
        const mediaHolderEls = this._getImgHolderEls();
        const mediaSrc = await this._getMediaSrc(mediaEls);
        const images = mediaEls.map((mediaEl, i) => {
            const src = mediaSrc[i];
            return {
                src: src,
                // TODO: remove me in master. This is not needed anymore as the
                // images of the rendered `website.gallery.slideshow` are replaced
                // by the elements of `imgHolderEls`.
                alt: mediaEl.tagName === "IMG" && mediaEl.getAttribute("alt") || "",
            };
        });
        var currentInterval = this.$target.find('.carousel:first').attr('data-bs-interval');
        var params = {
            images: images,
            index: 0,
            title: "",
            interval: currentInterval || 0,
            id: 'slideshow_' + new Date().getTime(),
            // TODO: in master, remove `attrClass` and `attStyle` from `params`.
            // This is not needed anymore as the images of the rendered
            // `website.gallery.slideshow` are replaced by the elements of
            // `imgHolderEls`.
            attrClass: imageEls.length > 0 ? imageEls[0].className : '',
            attrStyle: imageEls.length > 0 ? imageEls[0].style.cssText : '',
        },
        $slideshow = $(qweb.render('website.gallery.slideshow', params));
        const imgSlideshowEls = $slideshow[0].querySelectorAll("img[data-o-main-image]");
        imgSlideshowEls.forEach((imgSlideshowEl, index) => {
            // Replace the template image by the original one. This is needed in
            // order to keep the characteristics of the image such as the
            // filter, the width, the quality, the link on which the users are
            // redirected once they click on the image etc...
            imgSlideshowEl.after(mediaHolderEls[index]);
            imgSlideshowEl.remove();
        });
        this._replaceContent($slideshow);
        const indicatorEls = [...this.$target[0].querySelectorAll("[data-slide-to]")];
        mediaEls.forEach((mediaEl, index) => {
            mediaEl.setAttribute("contenteditable", true);
            mediaEl.setAttribute("data-index", index);
            // For videos, add a "play" icon in their carousel indicators.
            if (mediaEl.classList.contains("media_iframe_video")) {
                this._addVideoPlayIcon(indicatorEls[index]);
            }
        });
        this.$target.css('height', Math.round(window.innerHeight * 0.7));

        // Apply layout animation
        this.$target.off('slide.bs.carousel').off('slid.bs.carousel');
        this._slideshowStart();
        this.$('li.fa').off('click');
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Handles image removals and image index updates.
     *
     * @override
     */
    notify: function (name, data) {
        this._super(...arguments);
        // TODO Remove in master.
        if (!this.hasAddImages) {
            // In stable, the widget is instanciated twice. We do not want
            // operations, especially moves, to be performed twice.
            // We therefore ignore the requests from one of the instances.
            return;
        }
        // TODO In master: nest in a snippet_edition_request to await mode.
        if (name === 'image_removed') {
            data.$image.remove(); // Force the removal of the image before reset
            const mediaEls = this._getImages();
            if (!mediaEls.length) {
                // If the gallery is empty, display the "Add Images" message.
                this.removeAllImages();
                data.onSuccess();
                return;
            }
            // TODO In master: use async mode.
            this.trigger_up('snippet_edition_request', {exec: () => {
                return this._modeWithImageWait('reset', this.getMode()).then(() => data.onSuccess());
            }});
        } else if (name === 'image_index_request') {
            const mediaEls = this._getImages();
            let position = mediaEls.indexOf(data.$image[0]);
            if (position === 0 && data.position === "prev") {
                data.position = "last";
            } else if (position === mediaEls.length - 1 && data.position === "next") {
                data.position = "first";
            }
            mediaEls.splice(position, 1);
            switch (data.position) {
                case 'first':
                    mediaEls.unshift(data.$image[0]);
                    break;
                case 'prev':
                    mediaEls.splice(position - 1, 0, data.$image[0]);
                    break;
                case 'next':
                    mediaEls.splice(position + 1, 0, data.$image[0]);
                    break;
                case 'last':
                    mediaEls.push(data.$image[0]);
                    break;
            }
            position = mediaEls.indexOf(data.$image[0]);
            mediaEls.forEach((mediaEl, index) => {
                // Note: there might be more efficient ways to do that but it is
                // more simple this way and allows compatibility with 10.0 where
                // indexes were not the same as positions.
                mediaEl.setAttribute("data-index", index);
            });
            const currentMode = this.getMode();
            // TODO In master: use async mode.
            this.trigger_up('snippet_edition_request', {exec: () => {
                return this._modeWithImageWait('reset', currentMode).then(() => {
                    if (currentMode === 'slideshow') {
                        const $carousel = this.$target.find('.carousel');
                        $carousel.removeClass('slide');
                        $carousel.carousel(position);
                        this.$target.find('.carousel-indicators li').removeClass('active');
                        this.$target.find('.carousel-indicators li[data-bs-slide-to="' + position + '"]').addClass('active');
                        const activeSlideEl = this.$target[0].querySelector(".carousel-item.active");
                        const activeMediaEl = this._getAllMediaEls(activeSlideEl)[0];
                        this.trigger_up('activate_snippet', {
                            $snippet: $(activeMediaEl),
                            ifInactiveOptions: true,
                        });
                        $carousel.addClass('slide');
                    } else {
                        const imageEl = this.$target[0].querySelector(`[data-index='${position}']`);
                        this.trigger_up('activate_snippet', {
                            $snippet: $(imageEl),
                            ifInactiveOptions: true,
                        });
                    }
                    data.onSuccess();
                });
            }});
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _adaptNavigationIDs: function () {
        var uuid = new Date().getTime();
        this.$target.find('.carousel').attr('id', 'slideshow_' + uuid);
        _.each(this.$target.find('[data-bs-slide], [data-bs-slide-to]'), function (el) {
            var $el = $(el);
            if ($el.attr('data-bs-target')) {
                $el.attr('data-bs-target', '#slideshow_' + uuid);
            } else if ($el.attr('href')) {
                $el.attr('href', '#slideshow_' + uuid);
            }
        });
    },
    /**
     * @override
     */
    _computeWidgetState: function (methodName, params) {
        switch (methodName) {
            case 'mode': {
                let activeModeName = 'slideshow';
                for (const modeName of params.possibleValues) {
                    if (this.$target.hasClass(`o_${modeName}`)) {
                        activeModeName = modeName;
                        break;
                    }
                }
                this.activeMode = activeModeName;
                return activeModeName;
            }
            case 'columns': {
                return `${this._getColumns()}`;
            }
        }
        return this._super(...arguments);
    },
    /**
     * @private
     */
    async _computeWidgetVisibility(widgetName, params) {
        if (widgetName === 'slideshow_mode_opt') {
            return false;
        }
        return this._super(...arguments);
    },
    /**
     * Returns the medias, sorted by index.
     * TODO in master: rename the function to `getMedias`.
     *
     * @private
     * @returns {DOMElement[]}
     */
    _getImages: function () {
        let mediaEls = this._getAllMediaEls(this.$target[0]);
        mediaEls.sort((a, b) => this._getIndex(a) - this._getIndex(b));
        return mediaEls;
    },
    /**
     * Returns the medias, or the media holders if this holder is an anchor,
     * sorted by index.
     * TODO in master: rename the function to `getMediaHolderEls`.
     *
     * @private
     * @returns {Array.<HTMLElement|HTMLAnchorElement>}
     */
    _getImgHolderEls: function () {
        const mediaEls = this._getImages();
        return mediaEls.map(mediaEl => mediaEl.closest("a") || mediaEl);
    },
    /**
     * Returns all the media (i.e. images and videos) contained in the given element.
     *
     * @param {HTMLElement} element the ancestor containing the media elements.
     * @returns {Array}
     */
    _getAllMediaEls(element) {
        const mediaEls = [...element.querySelectorAll("img, .media_iframe_video")];
        return mediaEls;
    },
    /**
     * Returns the links to the medias images:
     *   - for an image: its src,
     *   - for a video: the link to its thumbnail,
     *   - otherwise: a placeholder image link.
     *
     * @param {Array} mediaEls the media elements
     * @returns {Array}
     */
    async _getMediaSrc(mediaEls) {
        const sources = [];
        for (const mediaEl of mediaEls) {
            let src = "/web/static/img/placeholder.png";
            if (mediaEl.tagName === "IMG") {
                // Use `getAttribute` instead of `.src` to not return the
                // absolute url.
                src = mediaEl.getAttribute("src");
            } else if (mediaEl.classList.contains("media_iframe_video")) {
                // For videos, get the thumbnail image link.
                src = await this._getVideoThumbnailSrc(mediaEl.dataset.oeExpression) || src;
            }
            sources.push(src);
        }
        return sources;
    },
    /**
     * Gets the video thumbnail link.
     *
     * @param {String} videoUrl the video link
     * @returns {String}
     */
    async _getVideoThumbnailSrc(videoUrl) {
        const videoThumbnailUrl = await this._rpc({
            route: "/website/get_video_thumbnail_url",
            params: {video_url: videoUrl},
        });
        return videoThumbnailUrl[1];
    },
    /**
     * Adds a play icon in the given carousel indicator element, in order to
     * show that its corresponding slide contains a video.
     *
     * @param {HTMLElement} indicatorEl the carousel indicator
     */
    _addVideoPlayIcon(indicatorEl) {
        const playIconEl = document.createElement("i");
        playIconEl.className = "fa fa-2x fa-play-circle text-white o_video_thumbnail";
        indicatorEl.append(playIconEl);
        indicatorEl.classList.add("o_not_editable"); // So the icon is not editable.
    },
    /**
     * Returns the index associated to a given media.
     *
     * @private
     * @param {DOMElement} mediaEl
     * @returns {integer}
     */
    _getIndex: function (mediaEl) {
        return mediaEl.dataset.index || 0;
    },
    /**
     * Returns the currently selected column option.
     *
     * @private
     * @returns {integer}
     */
    _getColumns: function () {
        return parseInt(this.$target.attr('data-columns')) || 3;
    },
    /**
     * Empties the container, adds the given content and returns the container.
     *
     * @private
     * @param {jQuery} $content
     * @returns {jQuery} the main container of the snippet
     */
    _replaceContent: function ($content) {
        var $container = this.$('> .container, > .container-fluid, > .o_container_small');
        $container.empty().append($content);
        return $container;
    },
    /**
     * Sets up listeners on slideshow to activate selected media.
     */
    _slideshowStart() {
        const $carousel = this.$bsTarget.is(".carousel") ? this.$bsTarget : this.$bsTarget.find(".carousel");
        let _previousEditor;
        let _miniatureClicked;
        const carouselIndicatorsEl = this.$target[0].querySelector(".carousel-indicators");
        if (carouselIndicatorsEl) {
            carouselIndicatorsEl.addEventListener("click", () => {
                _miniatureClicked = true;
            });
        }
        let lastSlideTimeStamp;
        $carousel.on("slide.bs.carousel.image_gallery", (ev) => {
            lastSlideTimeStamp = ev.timeStamp;
            const activeSlideEl = this.$target[0].querySelector(".carousel-item.active");
            const activeMediaEl = this._getAllMediaEls(activeSlideEl)[0];
            for (const editor of this.options.wysiwyg.snippetsMenu.snippetEditors) {
                if (editor.isShown() && editor.$target[0] === activeMediaEl) {
                    _previousEditor = editor;
                    editor.toggleOverlay(false);
                }
            }
        });
        $carousel.on("slid.bs.carousel.image_gallery", (ev) => {
            if (!_previousEditor && !_miniatureClicked) {
                return;
            }
            _previousEditor = undefined;
            _miniatureClicked = false;
            // slid.bs.carousel is most of the time fired too soon by bootstrap
            // since it emulates the transitionEnd with a setTimeout. We wait
            // here an extra 20% of the time before retargeting edition, which
            // should be enough...
            const _slideDuration = new Date().getTime() - lastSlideTimeStamp;
            setTimeout(() => {
                const activeSlideEl = this.$target[0].querySelector(".carousel-item.active");
                const activeMediaEl = this._getAllMediaEls(activeSlideEl)[0];
                this.trigger_up("activate_snippet", {
                    $snippet: $(activeMediaEl),
                    ifInactiveOptions: true,
                });
            }, 0.2 * _slideDuration);
        });
    },
    /**
     * Call mode while ensuring that all images are loaded.
     *
     * @see this.selectClass for parameters
     * @returns {Promise}
     */
    async _modeWithImageWait(previewMode, widgetValue, params) {
        // TODO Remove in master.
        let promise;
        this._masonryAwaitImages = true;
        try {
            await this.mode(previewMode, widgetValue, params);
            promise = this._masonryAwaitImagesPromise;
        } finally {
            this._masonryAwaitImages = false;
            this._masonryAwaitImagesPromise = undefined;
        }
        return promise || Promise.resolve();
    },
});

options.registry.gallery_img = options.Class.extend({
    /**
     * Rebuilds the whole gallery when one media is removed.
     *
     * @override
     */
    onRemove: function () {
        return new Promise(resolve => {
            this.trigger_up('option_update', {
                optionName: 'gallery',
                name: 'image_removed',
                data: {
                    $image: this.$target, // TODO in master: rename $image as $media.
                    onSuccess: () => resolve(),
                },
            });
        });
    },

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Allows to change the position of a media (its order in the media set).
     *
     * @see this.selectClass for parameters
     */
    position: function (previewMode, widgetValue, params) {
        return new Promise(resolve => {
            this.trigger_up('option_update', {
                optionName: 'gallery',
                name: 'image_index_request',
                data: {
                    $image: this.$target, // TODO in master: rename $image as $media.
                    position: widgetValue,
                    onSuccess: () => resolve(),
                },
            });
        });
    },
});
});
