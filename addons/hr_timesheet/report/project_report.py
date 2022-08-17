# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api


class ReportProjectTaskUser(models.Model):
    _inherit = "report.project.task.user"

    hours_planned = fields.Float('Planned Hours', readonly=True)
    hours_effective = fields.Float('Effective Hours', readonly=True)
    remaining_hours = fields.Float('Remaining Hours', readonly=True)
    progress = fields.Float('Progress', group_operator='avg', readonly=True)
    overtime = fields.Float(readonly=True)

    def _select(self):
<<<<<<< HEAD
        select_to_append = """,
                (t.effective_hours * 100) / NULLIF(t.planned_hours, 0) as progress,
                t.effective_hours as hours_effective,
                t.planned_hours - t.effective_hours - t.subtask_effective_hours as remaining_hours,
                NULLIF(t.planned_hours, 0) as hours_planned,
                t.overtime as overtime
        """
        return super(ReportProjectTaskUser, self)._select() + select_to_append
||||||| parent of 607897c96d77... temp
        return super(ReportProjectTaskUser, self)._select() + """,
            (t.effective_hours * 100) / NULLIF(planned_hours, 0) as progress,
            t.effective_hours as hours_effective,
            t.planned_hours - t.effective_hours - t.subtask_effective_hours as remaining_hours,
            NULLIF(planned_hours, 0) as hours_planned"""
=======
        return super(ReportProjectTaskUser, self)._select() + """,
            (t.effective_hours * 100) / NULLIF(t.planned_hours, 0) as progress,
            t.effective_hours as hours_effective,
            t.planned_hours - t.effective_hours - t.subtask_effective_hours as remaining_hours,
            NULLIF(t.planned_hours, 0) as hours_planned"""
>>>>>>> 607897c96d77... temp

    def _group_by(self):
<<<<<<< HEAD
        group_by_append = """,
                t.effective_hours,
                t.subtask_effective_hours,
                t.planned_hours,
                t.overtime
        """
        return super(ReportProjectTaskUser, self)._group_by() + group_by_append
||||||| parent of 607897c96d77... temp
        return super(ReportProjectTaskUser, self)._group_by() + """,
            remaining_hours,
            t.effective_hours,
            planned_hours
            """
=======
        return super(ReportProjectTaskUser, self)._group_by() + """,
            t.remaining_hours,
            t.effective_hours,
            t.planned_hours
            """
>>>>>>> 607897c96d77... temp

    @api.model
    def _fields_view_get(self, view_id=None, view_type='form', toolbar=False, submenu=False):
        result = super(ReportProjectTaskUser, self)._fields_view_get(view_id=view_id, view_type=view_type, toolbar=toolbar, submenu=submenu)
        if view_type in ['pivot', 'graph'] and self.env.company.timesheet_encode_uom_id == self.env.ref('uom.product_uom_day'):
            result['arch'] = self.env['account.analytic.line']._apply_time_label(result['arch'], related_model=self._name)
        return result
