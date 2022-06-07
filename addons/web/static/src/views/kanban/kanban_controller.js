/** @odoo-module **/

import { useService } from "@web/core/utils/hooks";
import { Layout } from "@web/search/layout";
import { usePager } from "@web/search/pager_hook";
import { useModel } from "@web/views/helpers/model";
import { standardViewProps } from "@web/views/helpers/standard_view_props";
import { useSetupView } from "@web/views/helpers/view_hook";
import { useViewButtons } from "@web/views/view_button/view_button_hook";
import { KanbanRenderer } from "./kanban_renderer";

const { Component, useRef } = owl;

// -----------------------------------------------------------------------------

export class KanbanController extends Component {
    setup() {
        this.actionService = useService("action");
        const { Model, resModel, fields, archInfo, limit, defaultGroupBy } = this.props;
        this.model = useModel(Model, {
            activeFields: archInfo.activeFields,
            progressAttributes: archInfo.progressAttributes,
            fields,
            resModel,
            handleField: archInfo.handleField,
            limit: archInfo.limit || limit,
            onCreate: archInfo.onCreate,
            quickCreateView: archInfo.quickCreateView,
            defaultGroupBy,
            viewMode: "kanban",
            openGroupsByDefault: true,
            tooltipInfo: archInfo.tooltipInfo,
        });

        const rootRef = useRef("root");
        useViewButtons(this.model, rootRef);
        useSetupView({ rootRef /** TODO **/ });
        usePager(() => {
            if (!this.model.root.isGrouped) {
                return {
                    offset: this.model.root.offset,
                    limit: this.model.root.limit,
                    total: this.model.root.count,
                    onUpdate: async ({ offset, limit }) => {
                        this.model.root.offset = offset;
                        this.model.root.limit = limit;
                        await this.model.root.load();
                        this.render(true); // FIXME WOWL reactivity
                    },
                };
            }
        });
    }

    async openRecord(record, mode) {
        const activeIds = this.model.root.records.map((datapoint) => datapoint.resId);
        this.props.selectRecord(record.resId, { activeIds, mode });
    }

    async createRecord(group) {
        const { onCreate } = this.props.archInfo;
        const { root } = this.model;
        if (onCreate === "quick_create" && root.canQuickCreate()) {
            await root.quickCreate(group);
        } else if (onCreate && onCreate !== "quick_create") {
            await this.actionService.doAction(onCreate, { additionalContext: root.context });
        } else {
            await this.props.createRecord();
        }
    }

    get canCreate() {
        if (!this.model.root.isGrouped) {
            return this.props.archInfo.activeActions.create;
        }
        return !this.props.archInfo.activeActions.groupCreate || this.model.root.groups.length > 0;
    }
}

KanbanController.template = `web.KanbanView`;
KanbanController.components = { Layout, KanbanRenderer };
KanbanController.props = {
    ...standardViewProps,
    Model: Function,
    Renderer: Function,
    buttonTemplate: String,
    archInfo: Object,
    forceGlobalClick: { type: Boolean, optional: true },
    defaultGroupBy: { validate: (dgb) => !dgb || typeof dgb === "string", optional: true },
};

KanbanController.defaultProps = {
    createRecord: () => {},
    selectRecord: () => {},
    forceGlobalClick: false,
};
