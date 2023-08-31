/* @odoo-module */

import { useService } from "@web/core/utils/hooks";

import { Component, useState } from "@odoo/owl";

/**
 * @typedef {Object} Props
 * @property {import("@mail/core/common/thread_model").Thread} thread
 * @property {string} size
 * @property {string} className
 * @extends {Component<Props, Env>}
 */
export class ThreadIcon extends Component {
    static template = "mail.ThreadIcon";
    static props = ["thread", "size?", "className?"];
    static defaultProps = {
        size: "medium",
        className: "",
    };

    setup() {
        this.store = useState(useService("mail.store"));
    }

    get chatPartner() {
        return this.store.Persona.get({ type: "partner", id: this.props.thread.chatPartnerId });
    }
}
