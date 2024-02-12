# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _


class Partner(models.Model):
    _inherit = ['res.partner']

    employee_ids = fields.One2many(
        'hr.employee', 'work_contact_id', string='Employees', groups="hr.group_hr_user",
        help="Related employees based on their private address")
    employee_id = fields.Many2one('hr.employee',
        compute='_compute_company_employee', search='_search_company_employee', string="First employee")
    employees_count = fields.Integer(compute='_compute_employees_count', groups="hr.group_hr_user")

    @api.depends_context('company')
    @api.depends('employee_ids')
    def _compute_company_employee(self):
        for partner in self:
            employees = partner.sudo().employee_ids.filtered(lambda e: e.company_id == self.env.company)
            partner.employee_id = employees[0] if employees else False

    def _search_company_employee(self, operator, value):
        return [('employee_ids', operator, value)]

    def _compute_employees_count(self):
        for partner in self:
            partner.employees_count = len(partner.employee_ids.filtered(lambda e: e.company_id in self.env.companies))

    def action_open_employees(self):
        self.ensure_one()
        if self.employees_count > 1:
            return {
                'name': _('Related Employees'),
                'type': 'ir.actions.act_window',
                'res_model': 'hr.employee',
                'view_mode': 'kanban',
                'domain': [('id', 'in', self.employee_ids.ids),
                           ('company_id', 'in', self.env.companies.ids)],
            }
        return {
            'name': _('Employee'),
            'type': 'ir.actions.act_window',
            'res_model': 'hr.employee',
            'res_id': self.employee_ids.id,
            'view_mode': 'form',
        }
