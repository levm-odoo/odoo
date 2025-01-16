import { Component, useState, useRef } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { useAutofocus } from "@web/core/utils/hooks";

export class SubtaskCreate extends Component {
    static template = "project.SubtaskCreate";
    static props = {
        name: String,
        isReadonly: { type: Boolean, optional: true },
        onSubtaskCreateNameChanged: { type: Function },
        onBlur: { type: Function },
    };
    setup() {
        this.placeholder = _t("Write a task name");
        this.state = useState({
            inputSize: 1,
            name: this.props.name,
        });
        this.input = useRef("subtaskCreateInput");
        useAutofocus({ refName: "subtaskCreateInput" });
    }

    /**
     * @private
     * @param {InputEvent} ev
     */
    _onFocus(ev) {
        ev.target.value = this.placeholder;
        ev.target.select();
    }

    /**
     * @private
     * @param {InputEvent} ev
     */
    _onInput(ev) {
        const value = ev.target.value;
        this.state.name = value;
    }

    _onClick() {
        this.input.el.focus();
    }

    async _onBlur() {
        this.props.onBlur();
    }

    /**
     * @private
     * @param {InputEvent} ev
     */
    _onNameChanged(ev) {
        if (this.state.isEscPressed) {
            this.state.isEscPressed = false;
            return;
        }
        const value = ev.target.value.trim();
        this.props.onSubtaskCreateNameChanged(value);
        ev.target.blur();
    }

    _onKeydown(ev) {
        if(ev.key == 'Escape') {
            this.state.isEscPressed = true;
            this.input.el.blur();
        }
    }

    _onSaveClick() {
        if (this.input.el.value !== "") {
            this.props.onSubtaskCreateNameChanged(this.input.el.value);
        }
    }
}
