/** @odoo-module **/

import { standardViewProps } from "@web/views/helpers/standard_view_props";
import { useService } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { renderToString } from "@web/core/utils/render";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { useSortable } from "@web/core/utils/ui";
import { BoardAction } from "./board_action";

const { Component, useState, useRef } = owl;

export class BoardController extends Component {
    setup() {
        this.board = useState(this.props.board);
        this.rpc = useService("rpc");
        this.dialogService = useService("dialog");
        const mainRef = useRef("main");
        useSortable({
            ref: mainRef,
            elements: ".o-dashboard-action",
            handle: ".o-dashboard-action-header",
            cursor: "move",
            groups: ".o-dashboard-column",
            connectGroups: true,
            onDrop: ({ element, previous, parent }) => {
                const fromColIdx = parseInt(element.parentElement.dataset.idx, 10);
                const fromActionIdx = parseInt(element.dataset.idx, 10);
                const toColIdx = parseInt(parent.dataset.idx, 10);
                const toActionIdx = previous ? parseInt(previous.dataset.idx, 10) + 1 : 0;
                if (fromColIdx !== toColIdx) {
                    // to reduce visual flickering
                    element.classList.add("d-none");
                }
                this.moveAction(fromColIdx, fromActionIdx, toColIdx, toActionIdx);
            },
        });
    }

    moveAction(fromColIdx, fromActionIdx, toColIdx, toActionIdx) {
        const action = this.board.columns[fromColIdx].actions[fromActionIdx];
        if (fromColIdx !== toColIdx) {
            // action moving from a column to another
            this.board.columns[fromColIdx].actions.splice(fromActionIdx, 1);
            this.board.columns[toColIdx].actions.splice(toActionIdx, 0, action);
        } else {
            // move inside a column
            if (fromActionIdx === toActionIdx) {
                return;
            }
            const actions = this.board.columns[fromColIdx].actions;
            if (fromActionIdx < toActionIdx) {
                actions.splice(toActionIdx + 1, 0, action);
                actions.splice(fromActionIdx, 1);
            } else {
                actions.splice(fromActionIdx, 1);
                actions.splice(toActionIdx, 0, action);
            }
        }
        this.saveBoard();
    }

    selectLayout(layout) {
        const currentColNbr = this.board.colNumber;
        const nextColNbr = layout.split("-").length;
        if (nextColNbr < currentColNbr) {
            // need to move all actions in last cols in the last visible col
            const cols = this.board.columns;
            const lastVisibleCol = cols[nextColNbr - 1];
            for (let i = nextColNbr; i < currentColNbr; i++) {
                lastVisibleCol.actions.push(...cols[i].actions);
                cols[i].actions = [];
            }
        }
        this.board.layout = layout;
        this.board.colNumber = nextColNbr;
        this.saveBoard();
        if (document.querySelector("canvas")) {
            // horrible hack to force charts to be recreated so they pick up the
            // proper size. also, no idea why raf is needed :(
            requestAnimationFrame(() => this.render(true));
        }
    }

    closeAction(column, action) {
        this.dialogService.add(ConfirmationDialog, {
            body: this.env._t("Are you sure that you want to remove this item?"),
            confirm: () => {
                const index = column.actions.indexOf(action);
                column.actions.splice(index, 1);
                this.saveBoard();
            },
            cancel: () => {},
        });
    }

    toggleAction(action) {
        action.isFolded = !action.isFolded;
        this.saveBoard();
    }

    saveBoard() {
        this.rpc("/web/view/edit_custom", {
            custom_id: this.board.customViewId,
            arch: renderToString("board.arch", this.board),
        });
        this.env.bus.trigger("CLEAR-CACHES");
    }
}

BoardController.template = "board.BoardView";
BoardController.components = { BoardAction, Dropdown, DropdownItem };
BoardController.props = {
    ...standardViewProps,
    board: Object,
};
