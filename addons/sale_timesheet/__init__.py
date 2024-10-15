# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from . import controllers
from .models import (
    AccountAnalyticLine, AccountMove, AccountMoveLine, HrEmployee, ProductProduct,
    ProductTemplate, ProjectProject, ProjectSaleLineEmployeeMap, ProjectTask, ProjectUpdate,
    ResConfigSettings, SaleOrder, SaleOrderLine,
)
from .wizard import ProjectCreateInvoice, SaleAdvancePaymentInv
from .report import ReportProjectTaskUser, TimesheetsAnalysisReport


def uninstall_hook(env):
    env.ref("account.account_analytic_line_rule_billing_user").write({'domain_force': "[(1, '=', 1)]"})

def _sale_timesheet_post_init(env):
    products = env['product.template'].search([
        ('type', '=', 'service'),
        ('service_tracking', 'in', ['no', 'task_global_project', 'task_in_project', 'project_only']),
        ('invoice_policy', '=', 'order'),
        ('service_type', '=', 'manual'),
    ])

    for product in products:
        product.service_type = 'timesheet'
        product._compute_service_policy()
