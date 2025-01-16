import { Component, onWillStart, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { serializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

export class PresetSlotsPopup extends Component {
    static template = "point_of_sale.PresetSlotsPopup";
    static components = { Dialog };
    static props = {
        close: Function,
        getPayload: Function,
    };

    setup() {
        this.pos = usePos();
        this.state = useState({
            selectedPresetId: this.pos.getOrder().preset_id.id,
            selectedDate: DateTime.fromSQL(
                this.pos.getOrder().preset_time || DateTime.now().toSQL()
            ).toFormat("yyyy-MM-dd"),
        });

        onWillStart(async () => {
            for (const preset of this.timedPresets) {
                await this.pos.syncPresetSlotAvaibility(preset);
            }
        });
    }

    get timedPresets() {
        return this.pos.models["pos.preset"].filter((p) => p.use_timing);
    }

    getSlotColor(slot, preset) {
        const isSelected = this.isSelected(slot.sql_datetime, preset);
        const isFull = slot.isFull;
        const isPast = DateTime.fromSQL(slot.sql_datetime) < DateTime.now();

        if (!isSelected && isFull) {
            return "o_colorlist_item_color_transparent_1"; // Red
        }

        return isSelected
            ? "btn-primary"
            : isPast
            ? "btn-secondary"
            : "o_colorlist_item_color_transparent_10"; // Green
    }

    isSelected(time, preset) {
        const order = this.pos.getOrder();
        return (
            order.preset_time === serializeDateTime(DateTime.fromSQL(time)) &&
            order.preset_id?.id === preset.id
        );
    }

    getSlotsForDate(preset, date) {
        const slots = Object.values(preset.availabilities[date]);
        return slots.reduce((acc, slot) => {
            if (!acc[slot.periode]) {
                acc[slot.periode] = [];
            }

            acc[slot.periode].push(slot);
            return acc;
        }, {});
    }

    getPeriodName(period) {
        const periodNames = {
            morning: _t("Morning"),
            lunch: _t("Lunch"),
            afternoon: _t("Afternoon"),
        };

        return periodNames[period];
    }

    getSlots(presetId) {
        return this.pos.models["pos.preset"].get(presetId).uiState.availabilities;
    }

    formatDate(date) {
        const dateObj = DateTime.fromFormat(date, "yyyy-MM-dd");
        return dateObj.toFormat("dd/MM/yyyy");
    }

    confirm(slot, preset) {
        this.props.getPayload({ slot, presetId: preset.id });
        this.props.close();
    }
}
