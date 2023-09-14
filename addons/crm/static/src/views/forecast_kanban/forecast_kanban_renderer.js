/** @odoo-module **/

import { CrmKanbanRenderer } from "@crm/views/crm_kanban/crm_kanban_renderer";
import { ForecastKanbanColumnQuickCreate } from "@crm/views/forecast_kanban/forecast_kanban_column_quick_create";

export class ForecastKanbanRenderer extends CrmKanbanRenderer {
    static template = "crm.ForecastKanbanRenderer";
    static components = {
        ...CrmKanbanRenderer.components,
        ForecastKanbanColumnQuickCreate,
    };

    setup() {
        super.setup(...arguments);
    }
    /**
     * @override
     *
     * Allow creating groups when grouping by forecast_field.
     */
    canCreateGroup() {
        return super.canCreateGroup(...arguments) || this.isGroupedByForecastField();
    }

    isGroupedByForecastField() {
        return (
            this.props.list.context.forecast_field &&
            this.props.list.groupByField.name === this.props.list.context.forecast_field
        );
    }

    isMovableField(field) {
        return super.isMovableField(...arguments) || field.name === "date_deadline";
    }

    async addForecastColumn() {
        this.env.searchModel.expandTemporalFilter();
    }
}
