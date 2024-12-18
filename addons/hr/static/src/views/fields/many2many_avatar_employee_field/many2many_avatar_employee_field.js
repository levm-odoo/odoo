import { registry } from "@web/core/registry";
import {
    Many2ManyTagsAvatarUserField,
    KanbanMany2ManyTagsAvatarUserField,
    ListMany2ManyTagsAvatarUserField,
    many2ManyTagsAvatarUserField,
    kanbanMany2ManyTagsAvatarUserField,
    listMany2ManyTagsAvatarUserField,
} from "@mail/views/web/fields/many2many_avatar_user_field/many2many_avatar_user_field";
import { EmployeeFieldRelationMixin } from "@hr/views/fields/employee_field_relation_mixin";

export class Many2ManyTagsAvatarEmployeeField extends EmployeeFieldRelationMixin(
    Many2ManyTagsAvatarUserField
) {
    displayAvatarCard(record) {
        return (
            (!this.env.isSmall && ["hr.employee", "hr.employee.public"].includes(this.relation)) ||
            super.displayAvatarCard(record)
        );
    }
}

export const many2ManyTagsAvatarEmployeeField = {
    ...many2ManyTagsAvatarUserField,
    component: Many2ManyTagsAvatarEmployeeField,
    additionalClasses: [
        ...many2ManyTagsAvatarUserField.additionalClasses,
        "o_field_many2many_avatar_user",
    ],
    extractProps: (fieldInfo, dynamicInfo) => ({
        ...many2ManyTagsAvatarUserField.extractProps(fieldInfo, dynamicInfo),
        canQuickCreate: false,
        relation: fieldInfo.options?.relation,
    }),
};

registry.category("fields").add("many2many_avatar_employee", many2ManyTagsAvatarEmployeeField);

export class KanbanMany2ManyTagsAvatarEmployeeField extends EmployeeFieldRelationMixin(
    KanbanMany2ManyTagsAvatarUserField
) {
    displayAvatarCard(record) {
        return (
            (!this.env.isSmall && ["hr.employee", "hr.employee.public"].includes(this.relation)) ||
            super.displayAvatarCard(record)
        );
    }
}

export const kanbanMany2ManyTagsAvatarEmployeeField = {
    ...kanbanMany2ManyTagsAvatarUserField,
    component: KanbanMany2ManyTagsAvatarEmployeeField,
    additionalClasses: [
        ...kanbanMany2ManyTagsAvatarUserField.additionalClasses,
        "o_field_many2many_avatar_user",
    ],
    extractProps: (fieldInfo, dynamicInfo) => ({
        ...kanbanMany2ManyTagsAvatarUserField.extractProps(fieldInfo, dynamicInfo),
        relation: fieldInfo.options?.relation,
    }),
};

registry
    .category("fields")
    .add("kanban.many2many_avatar_employee", kanbanMany2ManyTagsAvatarEmployeeField)
    .add("activity.many2many_avatar_employee", kanbanMany2ManyTagsAvatarEmployeeField);

export class ListMany2ManyTagsAvatarEmployeeField extends EmployeeFieldRelationMixin(
    ListMany2ManyTagsAvatarUserField
) {
    displayAvatarCard(record) {
        return (
            (!this.env.isSmall && ["hr.employee", "hr.employee.public"].includes(this.relation)) ||
            super.displayAvatarCard(record)
        );
    }
}

export const listMany2ManyTagsAvatarEmployeeField = {
    ...listMany2ManyTagsAvatarUserField,
    component: ListMany2ManyTagsAvatarEmployeeField,
    additionalClasses: [
        ...listMany2ManyTagsAvatarUserField.additionalClasses,
        "o_field_many2many_avatar_user",
    ],
};
registry
    .category("fields")
    .add("list.many2many_avatar_employee", listMany2ManyTagsAvatarEmployeeField);
