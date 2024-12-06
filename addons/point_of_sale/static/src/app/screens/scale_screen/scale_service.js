import { reactive } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { roundPrecision } from "@web/core/utils/numbers";

export class PosScaleService {
    constructor(env, deps) {
        const reactiveThis = reactive(this);
        reactiveThis.setup(env, deps);
        return reactiveThis;
    }

    setup(env, deps) {
        this.env = env;
        this.hardwareProxy = deps.hardware_proxy;
        this.reset();
    }

    reset() {
        this.weight = 0;
        this.tare = 0;
        this.product = null;
    }

    async readWeight() {
        this._checkScaleIsConnected();
        const { weight } = await this.hardwareProxy.message("scale_read");
        this.weight = weight;
    }

    setTare() {
        this.tare = this.weight;
    }

    get isManualMeasurement() {
        // In Community we don't know anything about the connected scale,
        // so we assume automatic measurement.
        return false;
    }

    get netWeight() {
        return roundPrecision(this.weight - this.tare, this.product.rounding);
    }

    get netWeightString() {
        const weightString = this.netWeight.toFixed(this._roundingDecimalPlaces);
        return `${weightString} ${this.product.unitOfMeasure}`;
    }

    get grossWeight() {
        const weight = roundPrecision(this.weight, this.product.rounding);
        const weightString = weight.toFixed(this._roundingDecimalPlaces);
        return `${weightString} ${this.product.unitOfMeasure}`;
    }

    get unitPrice() {
        const priceString = this.env.utils.formatCurrency(this.product.unitPrice);
        return `${priceString} / ${this.product.unitOfMeasure}`;
    }

    get totalPrice() {
        const priceString = this.env.utils.formatCurrency(this.netWeight * this.product.unitPrice);
        return priceString;
    }

    get _roundingDecimalPlaces() {
        return Math.ceil(Math.log(1.0 / this.product.rounding) / Math.log(10));
    }

    _checkScaleIsConnected() {
        if (this.hardwareProxy.connectionInfo.status !== "connected") {
            throw new Error(_t("Cannot weigh product - IoT Box is disconnected"));
        }
        if (this.hardwareProxy.connectionInfo.drivers.scale?.status !== "connected") {
            throw new Error(_t("Cannot weigh product - Scale is not connected to IoT Box"));
        }
    }
}

const posScaleService = {
    dependencies: ["hardware_proxy"],
    start(env, deps) {
        return new PosScaleService(env, deps);
    },
};

registry.category("services").add("pos_scale", posScaleService);
