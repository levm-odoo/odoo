import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component, onMounted, onWillUnmount, useState } from "@odoo/owl";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

const MEASURING_DELAY_MS = 500;
const TARE_TIMEOUT_MS = 3000;

export class ScaleScreen extends Component {
    static template = "point_of_sale.ScaleScreen";
    static components = { Dialog };
    static props = {
        getPayload: Function,
        close: Function,
    };
    setup() {
        this.pos = usePos();
        this.scale = useState(useService("pos_scale"));
        this.dialog = useService("dialog");
        this.state = useState({ tarePressed: false, weightLoading: false });
        onMounted(this.onMounted);
        onWillUnmount(this.onWillUnmount);
    }
    onMounted() {
        if (!this.scale.isManualMeasurement) {
            this.shouldRead = true;
            this._readScaleAutomatically();
        }
    }
    onWillUnmount() {
        this.shouldRead = false;
        this.scale.reset();
    }
    confirm() {
        this.props.getPayload(this.scale.netWeight);
        this.props.close();
    }

    _showError(message) {
        this.dialog.add(AlertDialog, {
            title: _t("Scale error"),
            body: message,
        });
    }

    async _readScaleAutomatically() {
        if (!this.shouldRead) {
            return;
        }
        await this.readScale();
        setTimeout(() => this._readScaleAutomatically(), MEASURING_DELAY_MS);
    }

    _setTareIfPending() {
        if (this.state.tarePressed) {
            this.scale.setTare();
            this.state.tarePressed = false;
        }
    }

    async readScale() {
        this.state.weightLoading = true;
        try {
            await this.scale.readWeight();
        } catch (error) {
            this._showError(error.message);
            this.props.close();
        }
        this.state.weightLoading = false;
        this._setTareIfPending();
    }

    async onTareClick() {
        this.state.tarePressed = true;
        if (this.scale.isManualMeasurement && !this.state.weightLoading) {
            this.readScale();
        } else {
            setTimeout(() => {
                this.state.tarePressed = false;
                this.scale.setTare();
            }, TARE_TIMEOUT_MS);
        }
    }
}
