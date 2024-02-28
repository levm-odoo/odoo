/** @odoo-module */
// @ts-check

import { HEADER_STYLE, TOP_LEVEL_STYLE, MEASURE_STYLE } from "@spreadsheet/helpers/constants";

/**
 * @typedef {import("@spreadsheet").SPTableColumn} SPTableColumn
 * @typedef {import("@spreadsheet").SPTableRow} SPTableRow
 * @typedef {import("@spreadsheet").SPTableData} SPTableData
 * @typedef {import("@spreadsheet").SPTableCell} SPTableCell
 */

/**
 * Class used to ease the construction of a pivot table.
 * Let's consider the following example, with:
 * - columns groupBy: [sales_team, create_date]
 * - rows groupBy: [continent, city]
 * - measures: [revenues]
 * _____________________________________________________________________________________|   ----|
 * |                |   Sale Team 1             |  Sale Team 2            |             |       |
 * |                |___________________________|_________________________|_____________|       |
 * |                |   May 2020   | June 2020  |  May 2020  | June 2020  |   Total     |       |<---- `cols`
 * |                |______________|____________|____________|____________|_____________|       |   ----|
 * |                |   Revenues   |  Revenues  |  Revenues  |  Revenues  |   Revenues  |       |       |<--- `measureRow`
 * |________________|______________|____________|____________|____________|_____________|   ----|   ----|
 * |Europe          |     25       |     35     |     40     |     30     |     65      |   ----|
 * |    Brussels    |      0       |     15     |     30     |     30     |     30      |       |
 * |    Paris       |     25       |     20     |     10     |     0      |     35      |       |
 * |North America   |     60       |     75     |            |            |     60      |       |<---- `body`
 * |    Washington  |     60       |     75     |            |            |     60      |       |
 * |Total           |     85       |     110    |     40     |     30     |     125     |       |
 * |________________|______________|____________|____________|____________|_____________|   ----|
 *
 * |                |
 * |----------------|
 *         |
 *         |
 *       `rows`
 *
 * `rows` is an array of cells, each cells contains the indent level, the fields used for the group by and the values for theses fields.
 * For example:
 *   `Europe`: { indent: 1, fields: ["continent"], values: ["id_of_Europe"]}
 *   `Brussels`: { indent: 2, fields: ["continent", "city"], values: ["id_of_Europe", "id_of_Brussels"]}
 *   `Total`: { indent: 0, fields: [], values: []}
 *
 * `columns` is an double array, first by row and then by cell. So, in this example, it looks like:
 *   [[row1], [row2], [measureRow]]
 *   Each cell of a column's row contains the width (span) of the cells, the fields used for the group by and the values for theses fields.
 * For example:
 *   `Sale Team 1`: { width: 2, fields: ["sales_team"], values: ["id_of_SaleTeam1"]}
 *   `May 2020` (the one under Sale Team 2): { width: 1, fields: ["sales_team", "create_date"], values: ["id_of_SaleTeam2", "May 2020"]}
 *   `Revenues` (the one under Total): { width: 1, fields: ["measure"], values: ["revenues"]}
 *
 */
export class SpreadsheetPivotTable {
    /**
     * @param {SPTableColumn[][]} cols
     * @param {SPTableRow[]} rows
     * @param {string[]} measures
     * @param {string} rowTitle
     */
    constructor(cols, rows, measures, rowTitle = "") {
        /** @type {SPTableColumn[][]} */
        this._cols = cols.map((row) => {
            // offset in the pivot table
            // starts at 1 because the first column is the row title
            let offset = 1;
            return row.map((col) => {
                col = { ...col, offset };
                offset += col.width;
                return col;
            });
        });
        this._rows = rows;
        this._measures = measures;
        this._rowTitle = rowTitle;
        this._maxIndent = Math.max(...this._rows.map((row) => row.indent));
        this._pivotCells = {};
    }

    /**
     * Get the number of columns leafs (i.e. the number of the last row of columns)
     * @returns {number}
     */
    getNumberOfDataColumns() {
        return this._cols.at(-1).length;
    }

    /**
     * Get the number of row in each column header
     * @return {number}
     */
    getNumberOfHeaderRows() {
        return this._cols.length;
    }

    /**
     * Get the number of rows
     *
     * @returns {number}
     */
    getNumberOfDataRows() {
        return this._rows.length;
    }

    /**
     * @returns {SPTableCell[][]}
     */
    getPivotCells(includeTotal = true, includeColumnHeaders = true) {
        const key = JSON.stringify({ includeTotal, includeColumnHeaders });
        if (!this._pivotCells[key]) {
            const numberOfDataRows = this.getNumberOfDataRows();
            const numberOfDataColumns = this.getNumberOfDataColumns();
            let pivotHeight = this.getNumberOfHeaderRows() + numberOfDataRows;
            let pivotWidth = 1 /*(row headers)*/ + numberOfDataColumns;
            if (!includeTotal && numberOfDataRows !== 1) {
                pivotHeight -= 1;
            }
            if (!includeTotal && numberOfDataColumns !== this._measures.length) {
                pivotWidth -= this._measures.length;
            }
            const domainArray = [];
            const startRow = includeColumnHeaders ? 0 : this.getNumberOfHeaderRows();
            for (let col = 0; col < pivotWidth; col++) {
                domainArray.push([]);
                for (let row = startRow; row < pivotHeight; row++) {
                    if (!includeTotal && row === pivotHeight) {
                        continue;
                    }
                    domainArray[col].push(this._getPivotCell(col, row, includeTotal));
                }
            }
            this._pivotCells[key] = domainArray;
        }
        return this._pivotCells[key];
    }

    _isTotalRow(row) {
        return this._rows[row].indent !== this._maxIndent;
    }

    /**
     * @returns {SPTableCell}
     */
    _getPivotCell(col, row, includeTotal = true) {
        const colHeadersHeight = this.getNumberOfHeaderRows();
        if (col === 0 && row === colHeadersHeight - 1) {
            return { content: this._rowTitle, isHeader: true, style: HEADER_STYLE };
        } else if (row <= colHeadersHeight - 1) {
            const domain = this._getColHeaderDomain(col, row);
            const style = row === colHeadersHeight - 1 ? MEASURE_STYLE : TOP_LEVEL_STYLE;
            return { domain, isHeader: true, style };
        } else if (col === 0) {
            const rowIndex = row - colHeadersHeight;
            const domain = this._getRowDomain(rowIndex);
            const indent = this._rows[rowIndex].indent;
            const style = indent <= 1 ? TOP_LEVEL_STYLE : indent === 2 ? HEADER_STYLE : undefined;
            return { domain, isHeader: true, style };
        } else {
            const rowIndex = row - colHeadersHeight;
            if (!includeTotal && this._isTotalRow(rowIndex)) {
                return { isHeader: false };
            }
            const domain = [...this._getRowDomain(rowIndex), ...this._getColDomain(col)];
            const measure = this._getColMeasure(col);
            return { domain, isHeader: false, measure };
        }
    }

    _getColHeaderDomain(col, row) {
        if (col === 0) {
            return undefined;
        }
        const domain = [];
        const pivotCol = this._cols[row].find((pivotCol) => pivotCol.offset === col);
        if (!pivotCol) {
            return undefined;
        }
        for (let i = 0; i < pivotCol.fields.length; i++) {
            domain.push(pivotCol.fields[i]);
            domain.push(pivotCol.values[i]);
        }
        return domain;
    }

    _getColDomain(col) {
        return this._getColHeaderDomain(col, this.getNumberOfHeaderRows() - 1).slice(0, -2); // slice: remove measure and value
    }

    _getColMeasure(col) {
        return this._getColHeaderDomain(col, this.getNumberOfHeaderRows() - 1).at(-1);
    }

    _getRowDomain(row) {
        const domain = [];
        for (let i = 0; i < this._rows[row].fields.length; i++) {
            domain.push(this._rows[row].fields[i]);
            domain.push(this._rows[row].values[i]);
        }
        return domain;
    }

    /**
     * @returns {SPTableData}
     */
    export() {
        return {
            cols: this._cols,
            rows: this._rows,
            measures: this._measures,
            rowTitle: this._rowTitle,
        };
    }
}
