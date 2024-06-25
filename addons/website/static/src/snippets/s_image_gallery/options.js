/** @odoo-module **/

import { MediaDialog } from "@web_editor/components/media_dialog/media_dialog";
import { CarouselHandler, SnippetOption } from "@web_editor/js/editor/snippets.options";
import { registerWebsiteOption } from "@website/js/editor/snippets.registry";
import wUtils from '@website/js/utils';
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";
import {
    loadImageInfo,
    applyModifications,
} from "@web_editor/js/editor/image_processing";

/**
 * This class provides layout methods for interacting with the ImageGallery
 * snippet. It is used by all options that need the layout to be recomputed.
 * This is typically the case when adding/removing/moving images, changing the
 * layout mode and changing the number of columns.
 */
class GalleryLayout extends CarouselHandler {
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Get the image target's layout mode (slideshow, masonry, grid or nomode).
     *
     * @private
     * @returns {String('slideshow'|'masonry'|'grid'|'nomode')}
     */
    _getMode() {
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
    }
    /**
     * Displays the images with the "grid" layout.
     *
     * @private
     */
    _grid() {
        const imgs = this._getImgHolderEls();
        var $row = $('<div/>', {class: 'row s_nb_column_fixed'});
        var columns = this._getColumns();
        var colClass = 'col-lg-' + (12 / columns);
        var $container = this._replaceContent($row);

        imgs.forEach((img, index) => {
            const $img = $(img.cloneNode(true));
            var $col = $('<div/>', {class: colClass});
            $col.append($img).appendTo($row);
            if ((index + 1) % columns === 0) {
                $row = $('<div/>', {class: 'row s_nb_column_fixed'});
                $row.appendTo($container);
            }
        });
        this.$target.css('height', '');
    }
    /**
     * Displays the images with the "masonry" layout.
     *
     * @private
     * @returns {Promise}
     */
    _masonry() {
        const imgs = this._getImgHolderEls();
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

        // Dispatch images in columns by always putting the next one in the
        // smallest-height column
        return new Promise(async resolve => {
            for (const imgEl of imgs) {
                let min = Infinity;
                let smallestColEl;
                for (const colEl of cols) {
                    const imgEls = colEl.querySelectorAll("img");
                    const lastImgRect = imgEls.length && imgEls[imgEls.length - 1].getBoundingClientRect();
                    const height = lastImgRect ? Math.round(lastImgRect.top + lastImgRect.height) : 0;
                    if (height < min) {
                        min = height;
                        smallestColEl = colEl;
                    }
                }
                // Only on Chrome: appended images are sometimes invisible
                // and not correctly loaded from cache, we use a clone of the
                // image to force the loading.
                smallestColEl.append(imgEl.cloneNode(true));
                await wUtils.onceAllImagesLoaded(this.$target);
            }
            resolve();
        });
    }
    /**
     * Allows to change the images layout. @see grid, masonry, nomode, slideshow
     *
     * @private
     * @param {string} modeName
     * @returns {Promise}
     */
    async _setMode(modeName) {
        modeName = modeName || 'slideshow'; // FIXME should not be needed
        this.$target.css('height', '');
        this.$target
            .removeClass('o_nomode o_masonry o_grid o_slideshow')
            .addClass('o_' + modeName);
        // Used to prevent the editor's "unbreakable protection mechanism" from
        // restoring Image Wall adaptations (images removed > new images added
        // to the container & layout updates) when adding new images to the
        // snippet.
        if (this.options.wysiwyg) {
            this.options.wysiwyg.odooEditor.unbreakableStepUnactive();
        }
        await this[`_${modeName}`]();
        this.callbacks.coverUpdate();
        await this._refreshPublicWidgets();
    }
    /**
     * Displays the images with the standard layout: floating images.
     *
     * @private
     */
    _nomode() {
        var $row = $('<div/>', {class: 'row s_nb_column_fixed'});
        const imgs = this._getItemsGallery();
        const imgHolderEls = this._getImgHolderEls();

        this._replaceContent($row);

        imgs.forEach((img, index) => {
            var wrapClass = 'col-lg-3';
            if (img.width >= img.height * 2 || img.width > 600) {
                wrapClass = 'col-lg-6';
            }
            var $wrap = $('<div/>', {class: wrapClass}).append(imgHolderEls[index]);
            $row.append($wrap);
        });
    }
    /**
     * Displays the images with a "slideshow" layout.
     *
     * @private
     */
    _slideshow() {
        const imageEls = this._getItemsGallery();
        const imgHolderEls = this._getImgHolderEls();
        var currentInterval = this.$target.find('.carousel:first').attr('data-bs-interval');
        var params = {
            images: imageEls,
            index: 0,
            interval: currentInterval || 0,
            ride: !currentInterval ? "false" : "carousel",
            id: 'slideshow_' + new Date().getTime(),
            hideImage: true,
        },
        $slideshow = $(renderToElement('website.gallery.slideshow', params));
        const carouselItemEls = $slideshow[0].querySelectorAll(".carousel-item");
        carouselItemEls.forEach((carouselItemEl, index) => {
            // Add the images in the carousel items.
            carouselItemEl.appendChild(imgHolderEls[index]);
        });
        this._replaceContent($slideshow);
        this.$("img").toArray().forEach((img, index) => {
            $(img).attr({contenteditable: true, 'data-index': index});
        });
        this.$target.css('height', Math.round(window.innerHeight * 0.7));

        // Apply layout animation
        this.$target.off('slide.bs.carousel').off('slid.bs.carousel');
        this._slideshowStart();
        this.$('li.fa').off('click');
    }
    /**
     * @override
     */
    _getItemsGallery() {
        const imgs = this.$('img').get();
        imgs.sort((a, b) => this._getIndex(a) - this._getIndex(b));
        return imgs;
    }
    /**
     * Returns the images, or the images holder if this holder is an anchor,
     * sorted by index.
     *
     * @private
     * @returns {Array.<HTMLImageElement|HTMLAnchorElement>}
     */
    _getImgHolderEls() {
        const imgEls = this._getItemsGallery();
        return imgEls.map(imgEl => imgEl.closest("a") || imgEl);
    }
    /**
     * Returns the index associated to a given image.
     *
     * @private
     * @param {DOMElement} img
     * @returns {integer}
     */
    _getIndex(img) {
        return img.dataset.index || 0;
    }
    /**
     * Returns the currently selected column option.
     *
     * @private
     * @returns {integer}
     */
    _getColumns() {
        return parseInt(this.$target.attr('data-columns')) || 3;
    }
    /**
     * @override
     */
    _reorderItems(itemsEls, newItemPosition) {
        itemsEls.forEach((img, index) => {
            img.dataset.index = index;
        });
        this.options.snippetEditionRequest({exec: async () => {
            await this._relayout();
            if (this._getMode() === "slideshow") {
                this._updateIndicatorAndActivateSnippet(newItemPosition);
            } else {
                const imageEl = this.$target[0].querySelector(`[data-index='${newItemPosition}']`);
                this.env.activateSnippet($(imageEl), false, true);
            }
        }});
    }
    /**
     * Empties the container, adds the given content and returns the container.
     *
     * @private
     * @param {jQuery} $content
     * @returns {jQuery} the main container of the snippet
     */
    _replaceContent($content) {
        var $container = this.$('> .container, > .container-fluid, > .o_container_small');
        $container.empty().append($content);
        return $container;
    }
    /**
     * Redraws the current layout.
     *
     * @private
     */
    _relayout() {
        return this._setMode(this._getMode());
    }
    /**
     * Sets up listeners on slideshow to activate selected image.
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
            const activeImageEl = this.$target[0].querySelector(".carousel-item.active img");
            this.env.isElementSelected({
                el: activeImageEl,
                callback: () => {
                    _previousEditor = true;
                },
            });
            this.env.hideOverlay();
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
                const activeImageEl = this.$target[0].querySelector(".carousel-item.active img");
                this.env.activateSnippet($(activeImageEl), false, true);
            }, 0.2 * _slideDuration);
        });
    }
}


class Gallery extends GalleryLayout {
    /**
     * @override
     */
    constructor() {
        super(...arguments);

        let layoutPromise;
        const containerEl = this.$target[0].querySelector(":scope > .container, :scope > .container-fluid, :scope > .o_container_small");
        if (containerEl.querySelector(":scope > *:not(div)")) {
            layoutPromise = this._relayout();
        } else {
            layoutPromise = Promise.resolve();
        }
        layoutPromise.then(() => {
            // Call specific mode's start if defined (e.g. _slideshowStart)
            const startMode = this[`_${this._getMode()}Start`];
            if (startMode) {
                startMode.bind(this)();
            }
        });
    }
    /**
     * @override
     */
    cleanForSave() {
        if (this.$target.hasClass('slideshow')) {
            this.$target.removeAttr('style');
        }
    }

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Allows to change the number of columns when displaying images with a
     * grid-like layout.
     *
     * @see this.selectClass for parameters
     */
    columns(previewMode, widgetValue, params) {
        const nbColumns = parseInt(widgetValue || '1');
        this.$target.attr('data-columns', nbColumns);

        return this._relayout();
    }
    /**
     * Allows to change the images layout. @see grid, masonry, nomode, slideshow
     *
     * @see this.selectClass for parameters
     */
    mode(previewMode, widgetValue, params) {
        return this._setMode(widgetValue);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _computeWidgetState(methodName, params) {
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
        return super._computeWidgetState(...arguments);
    }
    /**
     * @private
     */
    async _computeWidgetVisibility(widgetName, params) {
        if (widgetName === 'slideshow_mode_opt') {
            return false;
        }
        return super._computeWidgetVisibility(...arguments);
    }
}

class GalleryImageList extends GalleryLayout {
    constructor() {
        super(...arguments);
        this.dialog = this.env.services.dialog;

        // Make sure image previews are updated if images are changed
        this.$target.on('image_changed.gallery', 'img', ev => {
            const $img = $(ev.currentTarget);
            const index = this.$target.find('.carousel-item.active').index();
            this.$('.carousel:first li[data-bs-target]:eq(' + index + ')')
                .css('background-image', 'url(' + $img.attr('src') + ')');
        });

        // When the snippet is empty, an edition button is the default content
        // TODO find a nicer way to do that to have editor style
        this.$target.on('click.gallery', '.o_add_images', ev => {
            ev.stopImmediatePropagation();
            this.addImages(false);
        });

        this.$target.on('dropped.gallery', 'img', ev => {
            this._relayout();
            if (!ev.target.height) {
                $(ev.target).one('load', () => {
                    setTimeout(() => {
                        this.callbacks.coverUpdate();
                    });
                });
            }
        });
    }
    /**
     * @override
     */
    async onBuilt() {
        await super.onBuilt(...arguments);
        if (this.$target.find('.o_add_images').length) {
            await this.addImages(false);
        }
        // TODO should consider the async parts
        this._adaptNavigationIDs();
    }
    /**
     * @override
     */
    onClone() {
        this._adaptNavigationIDs();
    }
    /**
     * @override
     */
    destroy() {
        super.destroy(...arguments);
        this.$target.off('.gallery');
    }

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Allows to select images to add as part of the snippet.
     *
     * @see this.selectClass for parameters
     */
    addImages(previewMode) {
        const $images = this.$('img');
        const $container = this.$('> .container, > .container-fluid, > .o_container_small');
        const lastImage = this._getItemsGallery().at(-1);
        let index = lastImage ? this._getIndex(lastImage) : -1;
        return new Promise(resolve => {
            let savedPromise = Promise.resolve();
            const props = {
                multiImages: true,
                onlyImages: true,
                save: images => {
                    const imagePromises = [];
                    for (const image of images) {
                        const $img = $('<img/>', {
                            class: $images.length > 0 ? $images[0].className : 'img img-fluid d-block ',
                            src: image.src,
                            'data-index': ++index,
                            alt: image.alt || '',
                            'data-name': _t('Image'),
                            style: $images.length > 0 ? $images[0].style.cssText : '',
                        }).appendTo($container);
                        const imgEl = $img[0];
                        imagePromises.push(new Promise(resolve => {
                            loadImageInfo(imgEl).then(() => {
                                if (imgEl.dataset.mimetype && ![
                                    "image/gif",
                                    "image/svg+xml",
                                    "image/webp",
                                ].includes(imgEl.dataset.mimetype)) {
                                    // Convert to webp but keep original width.
                                    imgEl.dataset.mimetype = "image/webp";
                                    applyModifications(imgEl, {
                                        mimetype: "image/webp",
                                    }).then(src => {
                                        imgEl.src = src;
                                        imgEl.classList.add("o_modified_image_to_save");
                                        resolve();
                                    });
                                } else {
                                    resolve();
                                }
                            });
                        }));
                    }
                    savedPromise = Promise.all(imagePromises);
                    if (images.length > 0) {
                        savedPromise = savedPromise.then(async () => {
                            await this._relayout();
                        });
                        this.callbacks.coverUpdate();
                    }
                },
            };
            this.dialog.add(MediaDialog, props, {
                onClose: () => {
                    savedPromise.then(resolve);
                },
            });
        });
    }
    /**
     * Allows to remove all images. Restores the snippet to the way it was when
     * it was added in the page.
     *
     * @see this.selectClass for parameters
     */
    removeAllImages(previewMode) {
        const $addImg = $('<div>', {
            class: 'alert alert-info css_non_editable_mode_hidden text-center',
        });
        const $text = $('<span>', {
            class: 'o_add_images',
            style: 'cursor: pointer;',
            text: _t(" Add Images"),
        });
        const $icon = $('<i>', {
            class: ' fa fa-plus-circle',
        });
        this._replaceContent($addImg.append($icon).append($text));
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Handles image removals and image index updates.
     *
     * @override
     */
    notify(name, data) {
        super.notify(...arguments);
        if (name === 'image_removed') {
            data.$image.remove(); // Force the removal of the image before reset
            this.options.snippetEditionRequest({exec: () => {
                return this._relayout();
            }});
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _adaptNavigationIDs() {
        const uuid = new Date().getTime();
        this.$target.find('.carousel').attr('id', 'slideshow_' + uuid);
        this.$target.find('[data-bs-slide], [data-bs-slide-to]').toArray().forEach((el) => {
            const $el = $(el);
            if ($el.attr('data-bs-target')) {
                $el.attr('data-bs-target', '#slideshow_' + uuid);
            } else if ($el.attr('href')) {
                $el.attr('href', '#slideshow_' + uuid);
            }
        });
    }
}

class GalleryImage extends SnippetOption {
    /**
     * Rebuilds the whole gallery when one image is removed.
     *
     * @override
     */
    onRemove() {
        this.callbacks.notifyOptions({
            optionName: 'GalleryImageList',
            name: 'image_removed',
            data: {
                $image: this.$target,
            },
        });
    }
}

registerWebsiteOption("GalleryImageList", {
    Class: GalleryImageList,
    template: "website.GalleryImageList",
    selector: ".s_image_gallery",
}, { sequence: 24 }); // Before website.snippet_options_background_options
registerWebsiteOption("Gallery", {
    Class: Gallery,
    template: "website.Gallery",
    selector: ".s_image_gallery",
});
registerWebsiteOption("GalleryImage", {
    Class: GalleryImage,
    template: "website.GalleryImage",
    selector: ".s_image_gallery img",
});
