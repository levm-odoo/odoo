/** @odoo-module **/

import { useService } from "@web/core/utils/hooks";
import { Layout } from "@web/search/layout";
import { useModel } from "@web/views/model";
import { standardViewProps } from "@web/views/standard_view_props";
import { useSetupView } from "@web/views/view_hook";
import { SearchBar } from "@web/search/search_bar/search_bar";
import { CogMenu } from "@web/search/cog_menu/cog_menu";

import { Component, useRef } from "@odoo/owl";

export class PivotController extends Component {
    setup() {
        this.actionService = useService("action");
        this.model = useModel(this.props.Model, this.props.modelParams);

        useSetupView({
            rootRef: useRef("root"),
            getLocalState: () => {
                const { data, metaData } = this.model;
                return { data, metaData };
            },
            getContext: () => this.getContext(),
        });
    }
    /**
     * @returns {Object}
     */
    getContext() {
        return {
            pivot_measures: this.model.metaData.activeMeasures,
            pivot_column_groupby: this.model.metaData.fullColGroupBys,
            pivot_row_groupby: this.model.metaData.fullRowGroupBys,
        };
    }
}

PivotController.template = "web.PivotView";
PivotController.components = { Layout, SearchBar, CogMenu };

PivotController.props = {
    ...standardViewProps,
    Model: Function,
    modelParams: Object,
    Renderer: Function,
};
