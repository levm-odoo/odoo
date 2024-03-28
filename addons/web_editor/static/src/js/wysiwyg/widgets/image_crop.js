/** @odoo-module **/

import {applyModifications, cropperDataFields, activateCropper, loadImage, loadImageInfo} from "@web_editor/js/editor/image_processing";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import {
    Component,
    useRef,
    useState,
    onMounted,
    onWillDestroy,
    onWillUpdateProps,
    markup,
} from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { scrollTo, closestScrollableY } from "@web/core/utils/scrolling";
import weUtils from "@web_editor/js/common/utils";

export class ImageCrop extends Component {
    static template = 'web_editor.ImageCrop';
    static props = {
        showCount: { type: Number, optional: true },
        activeOnStart: { type: Boolean, optional: true },
        media: { optional: true },
        mimetype: { type: String, optional: true },
        getRecordInfo: { type: Function },
    };
    static defaultProps = {
        activeOnStart: false,
        showCount: 0,
    };
    aspectRatios = {
        "0/0": {label: _t("Flexible"), value: 0},
        "16/9": {label: "16:9", value: 16 / 9},
        "4/3": {label: "4:3", value: 4 / 3},
        "1/1": {label: "1:1", value: 1},
        "2/3": {label: "2:3", value: 2 / 3},
    };
    state = useState({
        active: false,
    });

    elRef = useRef('el');
    _cropperClosed = true;

    setup() {
        // This promise is resolved when the component is mounted. It is
        // required by a legacy mechanism to wait for the component to be
        // mounted. See `ImageTools.resetCrop`.
        this.mountedPromise = new Promise((resolve) => {
            this.mountedResolve = resolve;
        });
        this.notification = useService("notification");
        onMounted(async () => {
            const $el = $(this.elRef.el);
            this.$ = $el.find.bind($el);
            this.$('[data-action]').on('click', this._onCropOptionClick.bind(this));
            $el.on('zoom', this._onCropZoom.bind(this));
            if (this.props.activeOnStart) {
                this.state.active = true;
                await this._show(this.props);
            }
            this.mountedResolve();
        });
        onWillUpdateProps((newProps) => {
            if (newProps.showCount !== this.props.showCount) {
                this.state.active = true;
            }
            return this._show(newProps);
        });
        onWillDestroy(() => {
            this._closeCropper();
        });
    }

    _closeCropper() {
        if (this._cropperClosed) return;
        this._cropperClosed = true;
        if (this.$cropperImage) {
            this.$cropperImage.cropper('destroy');
            this.elRef.el.ownerDocument.removeEventListener('mousedown', this._onDocumentMousedown, {capture: true});
            this.elRef.el.ownerDocument.removeEventListener('keydown', this._onDocumentKeydown, {capture: true});
        }
        this.media.setAttribute('src', this.initialSrc);
        // Update the registry as the img src changes
        weUtils.updateImageDataRegistry(this.initialSrc, this.imageData);
        this.$media.trigger('image_cropper_destroyed');
        this.state.active = false;
    }

    /**
     * Resets the crop
     */
    async reset() {
        if (this.$cropperImage) {
            this.$cropperImage.cropper('reset');
            if (this.aspectRatio !== '0/0') {
                this.aspectRatio = '0/0';
                this.$cropperImage.cropper('setAspectRatio', this.aspectRatios[this.aspectRatio].value);
            }
            await this._save();
        }
    }

    /**
     * Crops the image into a 1:1 ratio or resets the crop, depending on the
     * preview mode.
     *
     *  @param {boolean} previewMode "reset", true or false.
     */
    async cropSquare(previewMode) {
        if(previewMode === "reset"){
            if (this.$cropperImage) {
                this.$cropperImage.cropper("setAspectRatio", this.aspectRatios[this.aspectRatio].value);
                await this._save(false);
            }
        } else {
            const ratio = "1/1";
            if (this.$cropperImage) {
                if (this.aspectRatio !== ratio) {
                    this.aspectRatio = previewMode ? this.aspectRatio : ratio;
                    this.$cropperImage.cropper("setAspectRatio", this.aspectRatios[ratio].value);
                }
                await this._save(false);
            }
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    async _show(props) {
        if (!props.media || !this.state.active) {
            return;
        }
        this._cropperClosed = false;
        this.media = props.media;
        this.$media = $(this.media);
        // Needed for editors in iframes.
        this.document = this.media.ownerDocument;
        // key: ratio identifier, label: displayed to user, value: used by cropper lib
        const src = this.media.getAttribute('src');
        this.initialSrc = src;
        if (!registry.category("image.data").get(src, undefined)) {
            const editableEl = this.media.closest(".o_editable");
            await loadImageInfo(this.media, props.getRecordInfo(editableEl));
        }
        this.imageData = weUtils.getImageData(this.media);
        this.aspectRatio = this.imageData.aspect_ratio || "0/0";
        const mimetype = this.imageData.mimetype ||
                src.endsWith('.png') ? 'image/png' :
                src.endsWith('.webp') ? 'image/webp' :
                'image/jpeg';
        this.mimetype = this.props.mimetype || mimetype;
        const isIllustration = /^\/web_editor\/shape\/illustration\//.test(this.imageData.original_src);
        this.uncroppable = false;
        if (this.imageData.original_src && !isIllustration) {
            this.originalSrc = this.imageData.original_src;
            this.originalId = this.imageData.original_id;
        } else {
            // Couldn't find an attachment: not croppable.
            this.uncroppable = true;
        }

        if (this.uncroppable) {
            this.notification.add(
                markup(_t("This type of image is not supported for cropping.<br/>If you want to crop it, please first download it from the original source and upload it in Odoo.")),
                {
                    title: _t("This image is an external image"),
                    type: 'warning',
                }
            )
            return this._closeCropper();
        }
        const $cropperWrapper = this.$('.o_we_cropper_wrapper');

        await this._scrollToInvisibleImage();
        // Replacing the src with the original's so that the layout is correct.
        await loadImage(this.originalSrc, this.media);
        this.$cropperImage = this.$('.o_we_cropper_img');
        const cropperImage = this.$cropperImage[0];
        [cropperImage.style.width, cropperImage.style.height] = [this.$media.width() + 'px', this.$media.height() + 'px'];
        
        const sel = this.document.getSelection();
        sel && sel.removeAllRanges();

        // Overlaying the cropper image over the real image
        const offset = this.$media.offset();
        offset.left += parseInt(this.$media.css('padding-left'));
        offset.top += parseInt(this.$media.css('padding-right'));
        const frameElement = this.$media[0].ownerDocument.defaultView.frameElement
        if (frameElement) {
            const frameRect = frameElement.getBoundingClientRect();
            offset.left += frameRect.left;
            offset.top += frameRect.top;
        }
        $cropperWrapper[0].style.left = `${offset.left}px`;
        $cropperWrapper[0].style.top = `${offset.top}px`;

        await loadImage(this.originalSrc, cropperImage);

        // We need to remove the d-none class for the cropper library to work.
        this.elRef.el.classList.remove('d-none');
        await activateCropper(cropperImage, this.aspectRatios[this.aspectRatio].value, this.imageData);

        this._onDocumentMousedown = this._onDocumentMousedown.bind(this);
        this._onDocumentKeydown = this._onDocumentKeydown.bind(this);
        // We use capture so that the handler is called before other editor handlers
        // like save, such that we can restore the src before a save.
        // We need to add event listeners to the owner document of the widget.
        this.elRef.el.ownerDocument.addEventListener('mousedown', this._onDocumentMousedown, {capture: true});
        this.elRef.el.ownerDocument.addEventListener('keydown', this._onDocumentKeydown, {capture: true});
    }
    /**
     * Updates the DOM image with cropped data and associates required
     * information for a potential future save (where required cropped data
     * attachments will be created).
     *
     * @private
     * @param {boolean} [refreshOptions=true]
     */
    async _save(refreshOptions = true) {
        // Mark the media for later creation of cropped attachment
        this.media.classList.add('o_modified_image_to_save');

        [...cropperDataFields, 'aspectRatio'].forEach(attr => {
            delete this.imageData[weUtils.convertCamelToSnakeString(attr)];
            const value = this._getAttributeValue(attr);
            if (value) {
                this.imageData[weUtils.convertCamelToSnakeString(attr)] = value;
            }
        });
        delete this.imageData.resize_width;
        this.initialSrc = await applyModifications(this.imageData, {forceModification: true, mimetype: this.mimetype});
        const cropped = this.aspectRatio !== "0/0";
        this.imageData.is_cropped = cropped;
        if(refreshOptions){
            this.$media.trigger('image_cropped');
        }
        this._closeCropper();
    }
    /**
     * Returns an attribute's value for saving.
     *
     * @private
     */
    _getAttributeValue(attr) {
        if (cropperDataFields.includes(attr)) {
            return this.$cropperImage.cropper('getData')[attr];
        }
        return this[attr];
    }
    /**
     * Resets the crop box to prevent it going outside the image.
     *
     * @private
     */
    _resetCropBox() {
        this.$cropperImage.cropper('clear');
        this.$cropperImage.cropper('crop');
    }
    /**
     * Make sure the targeted image is in the visible viewport before crop.
     *
     * @private
     */
    async _scrollToInvisibleImage() {
        const rect = this.media.getBoundingClientRect();
        const viewportTop = this.document.documentElement.scrollTop || 0;
        const viewportBottom = viewportTop + window.innerHeight;
        // Give priority to the closest scrollable element (e.g. for images in
        // HTML fields, the element to scroll is different from the document's
        // scrolling element).
        const scrollable = closestScrollableY(this.media);

        // The image must be in a position that allows access to it and its crop
        // options buttons. Otherwise, the crop widget container can be scrolled
        // to allow editing.
        if (rect.top < viewportTop || viewportBottom - rect.bottom < 100) {
            await scrollTo(this.media, {
                behavior: "smooth",
                ...(scrollable && { scrollable }),
            });
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when a crop option is clicked -> change the crop area accordingly.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onCropOptionClick(ev) {
        const {action, value, scaleDirection} = ev.currentTarget.dataset;
        switch (action) {
            case 'ratio':
                this.$cropperImage.cropper('reset');
                this.aspectRatio = value;
                this.$cropperImage.cropper('setAspectRatio', this.aspectRatios[this.aspectRatio].value);
                break;
            case 'zoom':
            case 'reset':
                this.$cropperImage.cropper(action, value);
                break;
            case 'rotate':
                this.$cropperImage.cropper(action, value);
                this._resetCropBox();
                break;
            case 'flip': {
                const amount = this.$cropperImage.cropper('getData')[scaleDirection] * -1;
                return this.$cropperImage.cropper(scaleDirection, amount);
            }
            case 'apply':
                return this._save();
            case 'discard':
                return this._closeCropper();
        }
    }
    /**
     * Discards crop if the user clicks outside of the widget.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onDocumentMousedown(ev) {
        if (this.elRef.el.ownerDocument.body.contains(ev.target) && this.$(ev.target).length === 0) {
            return this._closeCropper();
        }
    }
    /**
     * Save crop if user hits enter,
     * discard crop on escape.
     *
     * @private
     * @param {KeyboardEvent} ev
     */
    _onDocumentKeydown(ev) {
        if (ev.key === 'Enter') {
            return this._save();
        } else if (ev.key === 'Escape') {
            ev.stopImmediatePropagation();
            return this._closeCropper();
        }
    }
    /**
     * Resets the cropbox on zoom to prevent crop box overflowing.
     *
     * @private
     */
    async _onCropZoom() {
        // Wait for the zoom event to be fully processed before reseting.
        await new Promise(res => setTimeout(res, 0));
        this._resetCropBox();
    }
}
