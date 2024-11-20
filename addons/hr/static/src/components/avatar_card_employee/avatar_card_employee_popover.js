/** @odoo-module **/

import { AvatarCardResourcePopover } from "@resource_mail/components/avatar_card_resource/avatar_card_resource_popover";

export class AvatarCardEmployeePopover extends AvatarCardResourcePopover {
    static defaultProps = {
        ...AvatarCardResourcePopover.defaultProps,
        recordModel: "hr.employee",
    };
    async onWillStart() {
        [this.record] = await this.orm.read(this.props.recordModel, [this.props.id], this.fieldNames);
        this.record.employee_id = [this.props.id];
    }

    get fieldNames() {
        const excludedFields = ["employee_id", "resource_type"];
        return super.fieldNames.filter((field) => !excludedFields.includes(field));
    }
}
