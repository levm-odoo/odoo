/** @odoo-module */

import { QuestionPageListRenderer } from "./question_page_list_renderer";
import { registry } from "@web/core/registry";
import { useOpenX2ManyRecord, useX2ManyCrud, X2ManyFieldDialog } from "@web/views/fields/relational_utils";
import { patch } from '@web/core/utils/patch';
import { useService } from "@web/core/utils/hooks";
import { X2ManyField, x2ManyField } from "@web/views/fields/x2many/x2many_field";

const { useSubEnv } = owl;

patch(X2ManyFieldDialog.prototype, 'survey_question_chaining_with_validation', {
    /**
     * Re-enable buttons after our error is thrown because blocking normal
     * behavior is required to not close the dialog and stay in edition but
     * the buttons are required to try and save again after changing form data.
     *
     * @override
     */
    async saveAndNew() {
        const res = this._super(...arguments);
        if (this.record.resModel === 'survey.question') {
            const btns = this.modalRef.el.querySelectorAll(".modal-footer button"); // see XManyFieldDialog.disableButtons
            this.enableButtons(btns);
        }
        return res;
    }
});


/**
 * For convenience, we'll prevent closing the question form dialog and
 * stay in edit mode to make sure only valid records are saved. Therefore,
 * in case of error occurring when saving we will replace default error
 * modal with a notification.
 */

class SurveySaveError extends Error {}
function SurveySaveErrorHandler(env, error, originalError) {
    if (originalError instanceof SurveySaveError) {
        env.services.notification.add(originalError.message, {
            title: env._t("Validation Error"),
            type: "danger",
        });
        return true;
    }
}
registry
    .category("error_handlers")
    .add("surveySaveErrorHandler", SurveySaveErrorHandler, { sequence: 10 });

class QuestionPageOneToManyField extends X2ManyField {
    setup() {
        super.setup();
        useSubEnv({
            openRecord: (record) => this.openRecord(record),
        });
        this.notificationService = useService("notification");

        // Systematically and automatically save SurveyForm at each question edit/creation
        // enables checking validation parameters consistency and using questions as triggers
        // immediately during question creation.
        // Preparing everything in order to override `this._openRecord` below.
        const { saveRecord: superSaveRecord, updateRecord: superUpdateRecord } = useX2ManyCrud(
            () => this.list,
            this.isMany2Many
        );

        const self = this;
        const saveRecord = async (record) => {
            await superSaveRecord(record);
            try {
                await self.props.record.save();
            } catch (error) {
                // In case of error occurring when saving.
                // Remove erroneous question row added to the embedded list
                await this.list.delete(record);
                throw new SurveySaveError(error.data.message);
            }
        };

        const updateRecord = async (record) => {
            await superUpdateRecord(record);
            try {
                await self.props.record.save();
            } catch (error) {
                throw new SurveySaveError(error.data.message);
            }
        };

        const openRecord = useOpenX2ManyRecord({
            resModel: this.list.resModel,
            activeField: this.activeField,
            activeActions: this.activeActions,
            getList: () => this.list,
            saveRecord,
            updateRecord,
        });
        this._openRecord = async (params) => {
            if (!await self.props.record.save()) {
                // do not open question form as it won't be savable either.
                return;
            }
            if (params.record) {
                // Force synchronization of fields that depend on sequence
                // (allowed_triggering_question_ids, is_placed_before_trigger)
                // as records may have been re-ordered before opening this one.
                await params.record.load();
            }
            openRecord(params);
        };
        this.canOpenRecord = true;
    }
}
QuestionPageOneToManyField.components = {
    ...X2ManyField.components,
    ListRenderer: QuestionPageListRenderer,
};
QuestionPageOneToManyField.defaultProps = {
    ...X2ManyField.defaultProps,
    editable: "bottom",
};

export const questionPageOneToManyField = {
    ...x2ManyField,
    component: QuestionPageOneToManyField,
    additionalClasses: [...x2ManyField.additionalClasses || [], "o_field_one2many"],
    
};

registry.category("fields").add("question_page_one2many", questionPageOneToManyField);
