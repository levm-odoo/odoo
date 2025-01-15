import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/**
 * This widget is only used for the 'group_ids' field in the 'res.users'
 * interface, in order to configure accesses.
 */
export class Many2ManyResUserGroupField extends Component {
    static template = "web.ResUserGroups";
    static props = { ...standardFieldProps };

    get sections () {
        return this.props.record.data.view_group_hierarchy;
    }

    getTooltipInfo (category) {
        return category.description && JSON.stringify( {field: {help: category.description}} );
    }

    getSelectedGroup (category) {
        const ids = this.props.record.data.group_ids.currentIds;
        return category.groups.find(g => ids.includes(g[0]))?.[0] || false;
    }

    onChange(evt) {
        const groupIds = this.props.record.data.group_ids.currentIds;
        const groupId = parseInt(evt.target.value);
        const categoryId = parseInt(evt.target.dataset.categoryId);
        const add = groupId && !groupIds.includes(groupId) ? [groupId] : [];
        const remove = [];
        const categories = this.sections.map(section => section.categories).flat();
        const category = categories.find(category => category.id === categoryId);
        remove.push(...category.groups.filter(g => g[0] !== groupId).map(g => g[0]));
        if (remove.length || add.length) {
            return this.props.record.data.group_ids.addAndRemove({add: [...add], remove: [...remove]});
        }
    }
}

export const many2ManyResUserGroupField = {
    component: Many2ManyResUserGroupField,
    fieldDependencies: [
        { name: "view_group_hierarchy", type: "json", readonly: true },
    ],
};

registry.category("fields").add("user_group_ids", many2ManyResUserGroupField);
