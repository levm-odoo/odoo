/** @odoo-module */

import { registry } from '@web/core/registry';

import { kanbanView } from '@web/views/kanban/kanban_view';
import { KanbanModel } from '@web/views/kanban/kanban_model';

export class EmployeeKanbanRecord extends KanbanModel.Record {
    async requestOpenChat(employeeId) {
        const messaging = await this.model.env.services.messaging.get();
        messaging.requestOpenChat({ employeeId });
    }
}

export class EmployeeKanbanModel extends KanbanModel {
    setup(params, { messaging }) {
        super.setup(...arguments);
        this.messagingService = messaging;
    }
}
EmployeeKanbanModel.services = [...KanbanModel.services, "messaging"];
EmployeeKanbanModel.Record = EmployeeKanbanRecord;

registry.category('views').add('hr_employee_kanban', {
    ...kanbanView,
    Model: EmployeeKanbanModel,
});
