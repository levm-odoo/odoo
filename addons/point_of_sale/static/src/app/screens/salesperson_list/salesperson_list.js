import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { fuzzyLookup } from "@web/core/utils/search";
import { Dialog } from "@web/core/dialog/dialog";
import { SalespersonLine } from "@point_of_sale/app/screens/salesperson_list/salesperson_line/salesperson_line";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Input } from "@point_of_sale/app/generic_components/inputs/input/input";
import { Component, useState } from "@odoo/owl";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { unaccent } from "@web/core/utils/strings";

export class SalespersonList extends Component {
    static components = { SalespersonLine, Dialog, Input };
    static template = "point_of_sale.SalespersonList";
    static props = {
        salesperson: {
            optional: true,
            type: [{ value: null }, Object],
        },
        getPayload: { type: Function },
        close: { type: Function },
    };

    setup() {
        this.pos = usePos();
        this.ui = useState(useService("ui"));
        this.notification = useService("notification");
        this.dialog = useService("dialog");

        this.state = useState({
            query: null,
            previousQuery: "",
            currentOffset: 0,
        });

        // Listen for the "Enter" key to initiate search
        useHotkey("enter", () => this.onEnter());
    }

    async editSalesperson(s = false) {
        const salesperson = await this.pos.editSalesperson(s);
        if (salesperson) {
            this.clickSalesperson(salesperson);
        }
    }

    async onEnter() {
        if (!this.state.query) {
            return;
        }
        const result = await this.searchSalesperson();
        if (result.length > 0) {
            this.notification.add(
                _t('%s salesperson(s) found for "%s".', result.length, this.state.query),
                3000
            );
        } else {
            this.notification.add(_t('No salesperson found for "%s".', this.state.query));
        }
    }

    goToOrders(salesperson) {
        this.props.close();
        const salespersonHasActiveOrders = this.pos
            .get_open_orders()
            .some((order) => order.salesperson?.id === salesperson.id);
        const stateOverride = {
            search: {
                fieldName: "SALESPERSON",
                searchTerm: salesperson.name,
            },
            filter: salespersonHasActiveOrders ? "" : "SYNCED",
        };
        this.pos.showScreen("TicketScreen", { stateOverride });
    }

    confirm() {
        this.props.resolve({ confirmed: true, payload: this.state.selectedSalesperson });
        this.pos.closeTempScreen();
    }

    getSalespeople() {
        const searchWord = unaccent((this.state.query || "").trim(), false);
        const salespeople = this.pos.models["res.users"].getAll(); // Assuming 'res.users' represents salespeople
        const exactMatches = salespeople.filter((salesperson) => salesperson.exactMatch(searchWord));

        if (exactMatches.length > 0) {
            return exactMatches;
        }

        const availableSalespeople = searchWord
            ? fuzzyLookup(searchWord, salespeople, (salesperson) => unaccent(salesperson.searchString, false))
            : salespeople
                  .slice(0, 1000)
                  .toSorted((a, b) =>
                      this.props.salesperson?.id === a.id
                          ? -1
                          : (a.name || "").localeCompare(b.name || "")
                  );

        return availableSalespeople;
    }

    get isBalanceDisplayed() {
        return false;
    }

    clickSalesperson(salesperson) {
        this.props.getPayload(salesperson);
        this.props.close();
    }

    async searchSalesperson() {
        if (this.state.previousQuery != this.state.query) {
            this.state.currentOffset = 0;
        }
        const salesperson = await this.getNewSalespeople();

        if (this.state.previousQuery == this.state.query) {
            this.state.currentOffset += salesperson.length;
        } else {
            this.state.previousQuery = this.state.query;
            this.state.currentOffset = salesperson.length;
        }
        return salesperson;
    }

    async getNewSalespeople() {
        let domain = [];
        const limit = 30;
        if (this.state.query) {
            const search_fields = [
                "name",
                "email",
                "phone",
            ];
            domain = [
                ...Array(search_fields.length - 1).fill("|"),
                ...search_fields.map((field) => [field, "ilike", this.state.query + "%"]),
            ];
        }

        const result = await this.pos.data.searchRead("res.users", domain, [], {
            limit: limit,
            offset: this.state.currentOffset,
        });

        return result;
    }
}
