import { CONNECTION_STATE } from "@bus/services/bus_monitoring_service";
import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class BusConnectionAlert extends Component {
    static template = "bus.BusConnectionAlert";
    static props = {};

    setup() {
        this.busMonitoring = useState(useService("bus_monitoring_service"));
        this.messagesByConnectionState = {
            [CONNECTION_STATE.UNSTABLE]: _t("Real-time connection is unstable..."),
            [CONNECTION_STATE.LOST]: _t("Real-time connection lost..."),
        };
    }

    /**
     * Determine if a border should be shown around the screen in addition to
     * the failure message when an issue is detected.
     */
    get showBorderOnFailure() {
        return false;
    }

    get message() {
        return this.messagesByConnectionState[this.busMonitoring.connectionState];
    }
}

registry.category("main_components").add("bus_connection_alert", { Component: BusConnectionAlert });
