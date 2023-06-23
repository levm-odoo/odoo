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
            let isSaved = await superSaveRecord(record);
            try {
                const isSucceed = await self.props.record.save({
                    stayInEdition: true,
                    throwOnError: true,
                });
                isSaved = isSaved === false ? false : isSucceed;
            } catch (error) {
                self.handleSurveySaveError(error, record);
                return false;
            }
            return isSaved;
        };

        const updateRecord = async (record) => {
            let isUpdated = await superUpdateRecord(record);
            try {
                const isSaved = await self.props.record.save({ stayInEdition: true, throwOnError: true });
                isUpdated = isUpdated === false ? false : isSaved;
            } catch (error) {
                self.handleSurveySaveError(error);
                return false;
            }
            return isUpdated;
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
            if (!await self.props.record.save({ stayInEdition: true })) {
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

    /**
     * For convenience, we'll prevent closing the question form dialog and
     * stay in edit mode to make sure only valid records are saved. Therefore,
     * two things should be cared for in case of error occurring when saving
     * the question:
     *   * Remove erroneous question row added to the embedded list
     *   * Replace default error modal with a notification
     *
     *   @param {Error} error Error thrown when saving survey/question.
     *   @param {Record?} recordToDelete (optional) In case the error is
     *   thrown when saving a new question, it should be deleted from the
     *   list.
     */
    async handleSurveySaveError(error, recordToDelete) {
        if (recordToDelete) {
            await this.list.delete(recordToDelete);
        }
        this.notificationService.add(error.data.message, {
            title: this.env._t("Validation Error"),
            type: "danger",
        });
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
