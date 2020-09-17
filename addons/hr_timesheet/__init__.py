# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from . import models
from . import report
from . import wizard

from odoo import api, fields, SUPERUSER_ID, _


def create_internal_project(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    admin = env.ref('base.user_admin', raise_if_not_found=False)
    if not admin:
        return
    project_vals = []
    for company in env['res.company'].search([]):
        company = company.with_company(company)
        project_vals += [{
            'name': _('Internal'),
            'allow_timesheets': True,
            'company_id': company.id,
            'task_ids': [(0, 0, {
                'name': name,
                'company_id': company.id,
            }) for name in [_('Training'), _('Meeting')]]
        }]
    project_ids = env['project.project'].create(project_vals)

    env['account.analytic.line'].create([{
        'name': _("Analysis"),
        'user_id': admin.id,
        'date': fields.datetime.today(),
        'unit_amount': 0,
        'project_id': task.project_id.id,
        'task_id': task.id,
    } for task in project_ids.task_ids.filtered(lambda t: t.company_id in admin.employee_ids.company_id)])


def unlink_task_timesheets(cr, registry):

    # Original code from project/models/analytic_account.py that raises the error
    # projects = self.env['project.project'].search([('analytic_account_id', 'in', self.ids)])
    # has_tasks = self.env['project.task'].search_count([('project_id', 'in', projects.ids)])
    # if has_tasks:
    #     raise UserError(_('Please remove existing tasks in the project linked to the accounts you want to delete.'))

    # -> Remove analytic accounts from projects instead of unlinking timesheets from tasks?
    # for project in projects:
    #     project.write({"analytic_account_id": False})

    # Unlink timesheets from tasks
    env = api.Environment(cr, SUPERUSER_ID, {})
    for task in env["project.task"].search([("timesheet_ids", "!=", False)]):
        task.write({'timesheet_ids': [(5, 0, 0)]})
    # TODO: 1. Is the search domain needed? More efficient than writing on all tasks?
    #       2. Can this be shortened to avoid the loop? Like
    #          env["project.task"].write({'timesheet_ids': [(5, None, None)]})
    breakpoint()
