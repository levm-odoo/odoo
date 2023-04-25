/** @odoo-module */

import { useWowlService } from '@web/legacy/utils';
import { Component, onRendered, xml } from "@odoo/owl";
import { EmojiPicker } from '@web/core/emoji_picker/emoji_picker';

export class EmojiPickerWrapper extends Component {
    setup() {
        this.popover = useWowlService('popover');

        onRendered(() => {
            this.popover.add(this.props.targetEl, EmojiPicker, {
                onSelect: this.props.onSelect,
            }, { position: getComputedStyle(this.props.targetEl).direction === 'rtl' ? "bottom-end" : "bottom-start" });
        });
    }
}

EmojiPickerWrapper.template = xml``;
