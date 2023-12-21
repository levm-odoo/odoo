/** @odoo-module **/

import { orm } from "@web/core/orm";
import { registry } from "@web/core/registry";
import { listView } from "@web/views/list/list_view";
import { ListRenderer } from "@web/views/list/list_renderer";
import { useService } from "@web/core/utils/hooks";
import { Component, onWillStart } from "@odoo/owl";

export class LoyaltyActionHelper extends Component {
    static template = "loyalty.LoyaltyActionHelper";
    setup() {
        this.action = useService("action");

        onWillStart(async () => {
            this.loyaltyTemplateData = await orm.call(
                "loyalty.program",
                "get_program_templates",
                [],
                {
                    context: this.env.model.root.context,
                },
            );
        });
    }

    async onTemplateClick(templateId) {
        const action = await orm.call(
            "loyalty.program",
            "create_from_template",
            [templateId],
            {context: this.env.model.root.context},
        );
        if (!action) {
            return;
        }
        this.action.doAction(action);
    }
};

export class LoyaltyListRenderer extends ListRenderer {
    static template = "loyalty.LoyaltyListRenderer";
    static components = {
        ...LoyaltyListRenderer.components,
        LoyaltyActionHelper,
    };
};

export const LoyaltyListView = {
    ...listView,
    Renderer: LoyaltyListRenderer,
};

registry.category("views").add("loyalty_program_list_view", LoyaltyListView);
