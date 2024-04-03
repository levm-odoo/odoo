/** @odoo-module **/

import { crmKanbanView } from "@crm/views/crm_kanban/crm_kanban_view";
import { ForecastSearchBar } from "../forecast_search_bar";

export class ForecastKanbanController extends crmKanbanView.Controller {
    isQuickCreateField(field) {
        return super.isQuickCreateField(...arguments) || (field && field.name === "date_deadline");
    }
}

ForecastKanbanController.components.SearchBar = ForecastSearchBar;
