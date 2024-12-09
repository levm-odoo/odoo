# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import datetime
import json
import logging

from dateutil.relativedelta import relativedelta

from odoo import fields, models, api, _
from odoo.exceptions import UserError
from odoo.http import request
from odoo.tools.profiler import make_session
from odoo.tools.speedscope import Speedscope

_logger = logging.getLogger(__name__)


class IrProfile(models.Model):
    _name = 'ir.profile'
    _description = 'Profiling results'
    _log_access = False  # avoid useless foreign key on res_user
    _order = 'session desc, id desc'
    _allow_sudo_commands = False

    create_date = fields.Datetime('Creation Date')

    session = fields.Char('Session', index=True)
    name = fields.Char('Description')
    duration = fields.Float('Duration')

    init_stack_trace = fields.Text('Initial stack trace', prefetch=False)

    sql = fields.Text('Sql', prefetch=False)
    sql_count = fields.Integer('Queries Count')
    traces_async = fields.Text('Traces Async', prefetch=False)
    traces_sync = fields.Text('Traces Sync', prefetch=False)
    qweb = fields.Text('Qweb', prefetch=False)
    entry_count = fields.Integer('Entry count')

    speedscope = fields.Binary('Speedscope', compute='_compute_speedscope')
    speedscope_url = fields.Text('Open', compute='_compute_speedscope_url')

    @api.autovacuum
    def _gc_profile(self):
        # remove profiles older than 30 days
        domain = [('create_date', '<', fields.Datetime.now() - datetime.timedelta(days=30))]
        return self.sudo().search(domain).unlink()

    def _compute_speedscope(self):
        # The params variable is done to control input from the user
        # When expanding this, it should be select from an enum to input only the correct values
        params = {
            'constant_time' : request.httprequest.args.get('constant_time','False')=='True',
            'aggregate_sql' : request.httprequest.args.get('aggregate_sql','False')=='True',
        }
        for execution in self:
            sp = Speedscope(init_stack_trace=json.loads(execution.init_stack_trace))
            if execution.sql:
                sp.add('sql', json.loads(execution.sql),params['aggregate_sql'])
            if execution.traces_async:
                sp.add('frames', json.loads(execution.traces_async))
            if execution.traces_sync:
                sp.add('settrace', json.loads(execution.traces_sync))

            result = json.dumps(sp.add_default(**params).make())
            execution.speedscope = base64.b64encode(result.encode('utf-8'))

    def _compute_speedscope_url(self):
        for profile in self:
            profile.speedscope_url = f'/web/speedscope/{profile.id}'

    def _enabled_until(self):
        """
        If the profiling is enabled, return until when it is enabled.
        Otherwise return ``None``.
        """
        limit = self.env['ir.config_parameter'].sudo().get_param('base.profiling_enabled_until', '')
        return limit if str(fields.Datetime.now()) < limit else None

    def open_config_wizard(self):
        return {
            'type': 'ir.actions.act_window',
            'name': 'Profile render wizard',
            'res_model': 'base.render.profiling.wizard',
            'view_mode': 'form',
            'view_id': self.env.ref('base.render_profiling_wizard').id,
            'target': 'new',
            'context': {
                'profile_id': self.id,
            },
        }

    def open_profile(self, search_params=''):
        return {
            'type': 'ir.actions.act_url',
            'url': f"/web/speedscope/{self.id}?{search_params}",
            'target': 'new',
        }
    
    def download_profile(self, search_params=''):
        return {
            'type': 'ir.actions.act_url',
            'url': f"/web/speedscope/download/{self.id}?{search_params}",
            'target': 'new',
        }

    @api.model
    def set_profiling(self, profile=None, collectors=None, params=None):
        """
        Enable or disable profiling for the current user.

        :param profile: ``True`` to enable profiling, ``False`` to disable it.
        :param list collectors: optional list of collectors to use (string)
        :param dict params: optional parameters set on the profiler object
        """
        # Note: parameters are coming from a rpc calls or route param (public user),
        # meaning that corresponding session variables are client-defined.
        # This allows to activate any profiler, but can be
        # dangerous handling request.session.profile_collectors/profile_params.
        if profile:
            limit = self._enabled_until()
            _logger.info("User %s started profiling", self.env.user.name)
            if not limit:
                request.session['profile_session'] = None
                if self.env.user._is_system():
                    return {
                            'type': 'ir.actions.act_window',
                            'view_mode': 'form',
                            'res_model': 'base.enable.profiling.wizard',
                            'target': 'new',
                            'views': [[False, 'form']],
                        }
                raise UserError(_('Profiling is not enabled on this database. Please contact an administrator.'))
            if not request.session.get('profile_session'):
                request.session['profile_session'] = make_session(self.env.user.name)
                request.session['profile_expiration'] = limit
                if request.session.get('profile_collectors') is None:
                    request.session['profile_collectors'] = []
                if request.session.get('profile_params') is None:
                    request.session['profile_params'] = {}
        elif profile is not None:
            request.session['profile_session'] = None

        if collectors is not None:
            request.session['profile_collectors'] = collectors

        if params is not None:
            request.session['profile_params'] = params

        return {
            'session': request.session.get('profile_session'),
            'collectors': request.session.get('profile_collectors'),
            'params': request.session.get('profile_params'),
        }


class BaseEnableProfilingWizard(models.TransientModel):
    _name = 'base.enable.profiling.wizard'
    _description = "Enable profiling for some time"

    duration = fields.Selection([
        ('minutes_5', "5 Minutes"),
        ('hours_1', "1 Hour"),
        ('days_1', "1 Day"),
        ('months_1', "1 Month"),
    ], string="Enable profiling for")
    expiration = fields.Datetime("Enable profiling until", compute='_compute_expiration', store=True, readonly=False)

    @api.depends('duration')
    def _compute_expiration(self):
        for record in self:
            unit, quantity = (record.duration or 'days_0').split('_')
            record.expiration = fields.Datetime.now() + relativedelta(**{unit: int(quantity)})

    def submit(self):
        self.env['ir.config_parameter'].set_param('base.profiling_enabled_until', self.expiration)
        return False
    
class RenderProfilingWizard(models.TransientModel):
    _name = 'base.render.profiling.wizard'
    _description = "Enable profiling for some time"

    constant_time = fields.Boolean('Constant Time')
    aggregate_sql = fields.Boolean('Aggregate SQL')

    _search_params = fields.Char("Search Params", compute='_formulate_search_params')

    def _formulate_search_params(self):
        fields_to_include = ['constant_time','aggregate_sql']
        res = ''
        for field in fields_to_include:
            res += (f"{field}={self[field]}&")
        self._search_params = res
    
    def open_profile(self):
        return self.env['ir.profile'].browse(self.env.context['profile_id']).open_profile(self._search_params)

    def download_profile(self):
        return self.env['ir.profile'].browse(self.env.context['profile_id']).download_profile(self._search_params)

