# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import re
from collections import defaultdict

from pytz import timezone

from odoo import Command, _, api, fields, models, tools
from odoo.exceptions import MissingError, ValidationError
from odoo.tools import frozendict
from odoo.tools.float_utils import float_compare
from odoo.tools.safe_eval import safe_eval


class IrActionsActions(models.Model):
    _name = 'ir.actions.actions'
    _description = 'Actions'
    _table = 'ir_actions'
    _order = 'name'
    _allow_sudo_commands = False

    _path_unique = models.Constraint(
        'unique(path)',
        "Path to show in the URL must be unique! Please choose another one.",
    )

    name = fields.Char(string='Action Name', required=True, translate=True)
    type = fields.Char(string='Action Type', required=True)
    xml_id = fields.Char(compute='_compute_xml_id', string="External ID")
    path = fields.Char(string="Path to show in the URL")
    help = fields.Html(string='Action Description',
                       help='Optional help text for the users with a description of the target view, such as its usage and purpose.',
                       translate=True)
    binding_model_id = fields.Many2one('ir.model', ondelete='cascade',
                                       help="Setting a value makes this action available in the sidebar for the given model.")
    binding_type = fields.Selection([('action', 'Action'),
                                     ('report', 'Report')],
                                    required=True, default='action')
    binding_view_types = fields.Char(default='list,form')

    @api.constrains('path')
    def _check_path(self):
        for action in self:
            if action.path:
                if not re.fullmatch(r'[a-z][a-z0-9_-]*', action.path):
                    raise ValidationError(_('The path should contain only lowercase alphanumeric characters, underscore, and dash, and it should start with a letter.'))
                if action.path.startswith("m-"):
                    raise ValidationError(_("'m-' is a reserved prefix."))
                if action.path.startswith("action-"):
                    raise ValidationError(_("'action-' is a reserved prefix."))
                if action.path == "new":
                    raise ValidationError(_("'new' is reserved, and can not be used as path."))
                # Tables ir_act_window, ir_act_report_xml, ir_act_url, ir_act_server and ir_act_client
                # inherit from table ir_actions (see base_data.sql). The path must be unique across
                # all these tables. The unique constraint is not enough because a big limitation of
                # the inheritance feature is that unique indexes only apply to single tables, and
                # not accross all the tables. So we need to check the uniqueness of the path manually.
                # For more information, see: https://www.postgresql.org/docs/14/ddl-inherit.html#DDL-INHERIT-CAVEATS

                # Note that, we leave the unique constraint in place to check the uniqueness of the path
                # within the same table before checking the uniqueness across all the tables.
                if (self.env['ir.actions.actions'].search_count([('path', '=', action.path)]) > 1):
                    raise ValidationError(_("Path to show in the URL must be unique! Please choose another one."))

    def _compute_xml_id(self):
        res = self.get_external_id()
        for record in self:
            record.xml_id = res.get(record.id)

    @api.model_create_multi
    def create(self, vals_list):
        res = super().create(vals_list)
        # self.get_bindings() depends on action records
        self.env.registry.clear_cache()
        return res

    def write(self, vals):
        res = super().write(vals)
        # self.get_bindings() depends on action records
        self.env.registry.clear_cache()
        return res

    def unlink(self):
        """unlink ir.action.todo/ir.filters which are related to actions which will be deleted.
           NOTE: ondelete cascade will not work on ir.actions.actions so we will need to do it manually."""
        todos = self.env['ir.actions.todo'].search([('action_id', 'in', self.ids)])
        todos.unlink()
        filters = self.env['ir.filters'].search([('action_id', 'in', self.ids)])
        filters.unlink()
        res = super().unlink()
        # self.get_bindings() depends on action records
        self.env.registry.clear_cache()
        return res

    @api.ondelete(at_uninstall=True)
    def _unlink_check_home_action(self):
        self.env['res.users'].with_context(active_test=False).search([('action_id', 'in', self.ids)]).sudo().write({'action_id': None})

    @api.model
    def _get_eval_context(self, action=None):
        """ evaluation context to pass to safe_eval """
        return {
            'uid': self._uid,
            'user': self.env.user,
            'time': tools.safe_eval.time,
            'datetime': tools.safe_eval.datetime,
            'dateutil': tools.safe_eval.dateutil,
            'timezone': timezone,
            'float_compare': float_compare,
            'b64encode': base64.b64encode,
            'b64decode': base64.b64decode,
            'Command': Command,
        }

    @api.model
    def get_bindings(self, model_name):
        """ Retrieve the list of actions bound to the given model.

           :return: a dict mapping binding types to a list of dict describing
                    actions, where the latter is given by calling the method
                    ``read`` on the action record.
        """
        result = {}
        for action_type, all_actions in self._get_bindings(model_name).items():
            actions = []
            for action in all_actions:
                action = dict(action)
                groups = action.pop('groups_id', None)
                if groups and not any(self.env.user.has_group(ext_id) for ext_id in groups):
                    # the user may not perform this action
                    continue
                res_model = action.pop('res_model', None)
                if res_model and not self.env['ir.model.access'].check(
                    res_model,
                    mode='read',
                    raise_exception=False
                ):
                    # the user won't be able to read records
                    continue
                actions.append(action)
            if actions:
                result[action_type] = actions
        return result

    @tools.ormcache('model_name', 'self.env.lang')
    def _get_bindings(self, model_name):
        cr = self.env.cr

        # discard unauthorized actions, and read action definitions
        result = defaultdict(list)

        self.env.flush_all()
        cr.execute("""
            SELECT a.id, a.type, a.binding_type
              FROM ir_actions a
              JOIN ir_model m ON a.binding_model_id = m.id
             WHERE m.model = %s
          ORDER BY a.id
        """, [model_name])
        for action_id, action_model, binding_type in cr.fetchall():
            try:
                action = self.env[action_model].sudo().browse(action_id)
                fields = ['name', 'binding_view_types']
                for field in ('groups_id', 'res_model', 'sequence', 'domain'):
                    if field in action._fields:
                        fields.append(field)
                action = action.read(fields)[0]
                if action.get('groups_id'):
                    # transform the list of ids into a list of xml ids
                    groups = self.env['res.groups'].browse(action['groups_id'])
                    action['groups_id'] = list(groups._ensure_xml_id().values())
                if 'domain' in action and not action.get('domain'):
                    action.pop('domain')
                result[binding_type].append(frozendict(action))
            except (MissingError):
                continue

        # sort actions by their sequence if sequence available
        if result.get('action'):
            result['action'] = tuple(sorted(result['action'], key=lambda vals: vals.get('sequence', 0)))
        return frozendict(result)

    @api.model
    def _for_xml_id(self, full_xml_id):
        """ Returns the action content for the provided xml_id

        :param xml_id: the namespace-less id of the action (the @id
                       attribute from the XML file)
        :return: A read() view of the ir.actions.action safe for web use
        """
        record = self.env.ref(full_xml_id)
        assert isinstance(self.env[record._name], self.env.registry[self._name])
        return record._get_action_dict()

    def _get_action_dict(self):
        """ Returns the action content for the provided action record.
        """
        self.ensure_one()
        readable_fields = self._get_readable_fields()
        return {
            field: value
            for field, value in self.sudo().read()[0].items()
            if field in readable_fields
        }

    def _get_readable_fields(self):
        """ return the list of fields that are safe to read

        Fetched via /web/action/load or _for_xml_id method
        Only fields used by the web client should included
        Accessing content useful for the server-side must
        be done manually with superuser
        """
        return {
            "binding_model_id", "binding_type", "binding_view_types",
            "display_name", "help", "id", "name", "type", "xml_id",
            "path",
        }


class IrActionsAct_Window(models.Model):
    _name = 'ir.actions.act_window'
    _description = 'Action Window'
    _table = 'ir_act_window'
    _inherit = ['ir.actions.actions']
    _order = 'name'
    _allow_sudo_commands = False

    @api.constrains('res_model', 'binding_model_id')
    def _check_model(self):
        for action in self:
            if action.res_model not in self.env:
                raise ValidationError(_('Invalid model name “%s” in action definition.', action.res_model))
            if action.binding_model_id and action.binding_model_id.model not in self.env:
                raise ValidationError(_('Invalid model name “%s” in action definition.', action.binding_model_id.model))

    @api.depends('view_ids.view_mode', 'view_mode', 'view_id.type')
    def _compute_views(self):
        """ Compute an ordered list of the specific view modes that should be
            enabled when displaying the result of this action, along with the
            ID of the specific view to use for each mode, if any were required.

            This function hides the logic of determining the precedence between
            the view_modes string, the view_ids o2m, and the view_id m2o that
            can be set on the action.
        """
        for act in self:
            act.views = [(view.view_id.id, view.view_mode) for view in act.view_ids]
            got_modes = [view.view_mode for view in act.view_ids]
            all_modes = act.view_mode.split(',')
            missing_modes = [mode for mode in all_modes if mode not in got_modes]
            if missing_modes:
                if act.view_id.type in missing_modes:
                    # reorder missing modes to put view_id first if present
                    missing_modes.remove(act.view_id.type)
                    act.views.append((act.view_id.id, act.view_id.type))
                act.views.extend([(False, mode) for mode in missing_modes])

    @api.constrains('view_mode')
    def _check_view_mode(self):
        for rec in self:
            modes = rec.view_mode.split(',')
            if len(modes) != len(set(modes)):
                raise ValidationError(_('The modes in view_mode must not be duplicated: %s', modes))
            if ' ' in modes:
                raise ValidationError(_('No spaces allowed in view_mode: “%s”', modes))

    type = fields.Char(default="ir.actions.act_window")
    view_id = fields.Many2one('ir.ui.view', string='View Ref.', ondelete='set null')
    domain = fields.Char(string='Domain Value',
                         help="Optional domain filtering of the destination data, as a Python expression")
    context = fields.Char(string='Context Value', default={}, required=True,
                          help="Context dictionary as Python expression, empty by default (Default: {})")
    res_id = fields.Integer(string='Record ID', help="Database ID of record to open in form view, when ``view_mode`` is set to 'form' only")
    res_model = fields.Char(string='Destination Model', required=True,
                            help="Model name of the object to open in the view window")
    target = fields.Selection([('current', 'Current Window'), ('new', 'New Window'), ('fullscreen', 'Full Screen'), ('main', 'Main action of Current Window')], default="current", string='Target Window')
    view_mode = fields.Char(required=True, default='list,form',
                            help="Comma-separated list of allowed view modes, such as 'form', 'list', 'calendar', etc. (Default: list,form)")
    mobile_view_mode = fields.Char(default="kanban", help="First view mode in mobile and small screen environments (default='kanban'). If it can't be found among available view modes, the same mode as for wider screens is used)")
    usage = fields.Char(string='Action Usage',
                        help="Used to filter menu and home actions from the user form.")
    view_ids = fields.One2many('ir.actions.act_window.view', 'act_window_id', string='No of Views')
    views = fields.Binary(compute='_compute_views',
                          help="This function field computes the ordered list of views that should be enabled " \
                               "when displaying the result of an action, federating view mode, views and " \
                               "reference view. The result is returned as an ordered list of pairs (view_id,view_mode).")
    limit = fields.Integer(default=80, help='Default limit for the list view')
    groups_id = fields.Many2many('res.groups', 'ir_act_window_group_rel',
                                 'act_id', 'gid', string='Groups')
    search_view_id = fields.Many2one('ir.ui.view', string='Search View Ref.')
    embedded_action_ids = fields.One2many('ir.embedded.actions', compute="_compute_embedded_actions")
    filter = fields.Boolean()

    def _compute_embedded_actions(self):
        embedded_actions = self.env["ir.embedded.actions"].search([('parent_action_id', 'in', self.ids)]).filtered(lambda x: x.is_visible)
        for action in self:
            action.embedded_action_ids = embedded_actions.filtered(lambda rec: rec.parent_action_id == action)

    def read(self, fields=None, load='_classic_read'):
        """ call the method get_empty_list_help of the model and set the window action help message
        """
        result = super().read(fields, load=load)
        if not fields or 'help' in fields:
            for values in result:
                model = values.get('res_model')
                if model in self.env:
                    eval_ctx = dict(self.env.context)
                    try:
                        ctx = safe_eval(values.get('context', '{}'), eval_ctx)
                    except:
                        ctx = {}
                    values['help'] = self.with_context(**ctx).env[model].get_empty_list_help(values.get('help', ''))
        return result

    @api.model_create_multi
    def create(self, vals_list):
        self.env.registry.clear_cache()
        for vals in vals_list:
            if not vals.get('name') and vals.get('res_model'):
                vals['name'] = self.env[vals['res_model']]._description
        return super().create(vals_list)

    def unlink(self):
        self.env.registry.clear_cache()
        return super().unlink()

    def exists(self):
        ids = self._existing()
        existing = self.filtered(lambda rec: rec.id in ids)
        return existing

    @api.model
    @tools.ormcache()
    def _existing(self):
        self._cr.execute("SELECT id FROM %s" % self._table)
        return set(row[0] for row in self._cr.fetchall())


    def _get_readable_fields(self):
        return super()._get_readable_fields() | {
            "context", "mobile_view_mode", "domain", "filter", "groups_id", "limit",
            "res_id", "res_model", "search_view_id", "target", "view_id", "view_mode", "views", "embedded_action_ids",
            # this is used by frontend, with the document layout wizard before send and print
            "close_on_report_download",
        }

    def _get_action_dict(self):
        """ Override to return action content with detailed embedded actions data if available.

            :return: A dict with updated action dictionary including embedded actions information.
        """
        result = super()._get_action_dict()
        if embedded_action_ids := result["embedded_action_ids"]:
            EmbeddedActions = self.env["ir.embedded.actions"]
            embedded_fields = EmbeddedActions._get_readable_fields()
            result["embedded_action_ids"] = EmbeddedActions.browse(embedded_action_ids).read(embedded_fields)
        return result


VIEW_TYPES = [
    ('list', 'List'),
    ('form', 'Form'),
    ('graph', 'Graph'),
    ('pivot', 'Pivot'),
    ('calendar', 'Calendar'),
    ('kanban', 'Kanban'),
]


class IrActionsAct_WindowView(models.Model):
    _name = 'ir.actions.act_window.view'
    _description = 'Action Window View'
    _table = 'ir_act_window_view'
    _rec_name = 'view_id'
    _order = 'sequence,id'
    _allow_sudo_commands = False

    _unique_mode_per_action = models.UniqueIndex('(act_window_id, view_mode)')

    sequence = fields.Integer()
    view_id = fields.Many2one('ir.ui.view', string='View')
    view_mode = fields.Selection(VIEW_TYPES, string='View Type', required=True)
    act_window_id = fields.Many2one('ir.actions.act_window', string='Action', ondelete='cascade')
    multi = fields.Boolean(string='On Multiple Doc.', help="If set to true, the action will not be displayed on the right toolbar of a form view.")


class IrActionsAct_Window_Close(models.Model):
    _name = 'ir.actions.act_window_close'
    _description = 'Action Window Close'
    _inherit = ['ir.actions.actions']
    _table = 'ir_actions'
    _allow_sudo_commands = False

    type = fields.Char(default='ir.actions.act_window_close')

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {
            # 'effect' and 'infos' are not real fields of `ir.actions.act_window_close` but they are
            # used to display the rainbowman ('effect') and waited by the action_service ('infos').
            "effect", "infos"
        }


class IrActionsAct_Url(models.Model):
    _name = 'ir.actions.act_url'
    _description = 'Action URL'
    _table = 'ir_act_url'
    _inherit = ['ir.actions.actions']
    _order = 'name'
    _allow_sudo_commands = False

    type = fields.Char(default='ir.actions.act_url')
    url = fields.Text(string='Action URL', required=True)
    target = fields.Selection([('new', 'New Window'), ('self', 'This Window'), ('download', 'Download')],
                              string='Action Target', default='new', required=True)

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {
            "target", "url", "close",
        }


class IrActionsTodo(models.Model):
    """
    Configuration Wizards
    """
    _description = "Configuration Wizards"
    _rec_name = 'action_id'
    _order = "sequence, id"
    _allow_sudo_commands = False

    action_id = fields.Many2one('ir.actions.actions', string='Action', required=True, index=True)
    sequence = fields.Integer(default=10)
    state = fields.Selection([('open', 'To Do'), ('done', 'Done')], string='Status', default='open', required=True)
    name = fields.Char()

    @api.model_create_multi
    def create(self, vals_list):
        todos = super(IrActionsTodo, self).create(vals_list)
        for todo in todos:
            if todo.state == "open":
                self.ensure_one_open_todo()
        return todos

    def write(self, vals):
        res = super(IrActionsTodo, self).write(vals)
        if vals.get('state', '') == 'open':
            self.ensure_one_open_todo()
        return res

    @api.model
    def ensure_one_open_todo(self):
        open_todo = self.search([('state', '=', 'open')], order='sequence asc, id desc', offset=1)
        if open_todo:
            open_todo.write({'state': 'done'})

    def unlink(self):
        if self:
            try:
                todo_open_menu = self.env.ref('base.open_menu')
                # don't remove base.open_menu todo but set its original action
                if todo_open_menu in self:
                    todo_open_menu.action_id = self.env.ref('base.action_client_base_menu').id
                    self -= todo_open_menu
            except ValueError:
                pass
        return super(IrActionsTodo, self).unlink()

    def action_launch(self):
        """ Launch Action of Wizard"""
        self.ensure_one()

        self.write({'state': 'done'})

        # Load action
        action_type = self.action_id.type
        action = self.env[action_type].browse(self.action_id.id)

        result = action.read()[0]
        if action_type != 'ir.actions.act_window':
            return result
        result.setdefault('context', '{}')

        # Open a specific record when res_id is provided in the context
        ctx = safe_eval(result['context'], {'user': self.env.user})
        if ctx.get('res_id'):
            result['res_id'] = ctx.pop('res_id')

        # disable log for automatic wizards
        ctx['disable_log'] = True

        result['context'] = ctx

        return result

    def action_open(self):
        """ Sets configuration wizard in TODO state"""
        return self.write({'state': 'open'})


class IrActionsClient(models.Model):
    _name = 'ir.actions.client'
    _description = 'Client Action'
    _inherit = ['ir.actions.actions']
    _table = 'ir_act_client'
    _order = 'name'
    _allow_sudo_commands = False

    type = fields.Char(default='ir.actions.client')

    tag = fields.Char(string='Client action tag', required=True,
                      help="An arbitrary string, interpreted by the client"
                           " according to its own needs and wishes. There "
                           "is no central tag repository across clients.")
    target = fields.Selection([('current', 'Current Window'), ('new', 'New Window'), ('fullscreen', 'Full Screen'), ('main', 'Main action of Current Window')], default="current", string='Target Window')
    res_model = fields.Char(string='Destination Model', help="Optional model, mostly used for needactions.")
    context = fields.Char(string='Context Value', default="{}", required=True, help="Context dictionary as Python expression, empty by default (Default: {})")
    params = fields.Binary(compute='_compute_params', inverse='_inverse_params', string='Supplementary arguments',
                           help="Arguments sent to the client along with "
                                "the view tag")
    params_store = fields.Binary(string='Params storage', readonly=True, attachment=False)

    @api.depends('params_store')
    def _compute_params(self):
        self_bin = self.with_context(bin_size=False, bin_size_params_store=False)
        for record, record_bin in zip(self, self_bin):
            record.params = record_bin.params_store and safe_eval(record_bin.params_store, {'uid': self._uid})

    def _inverse_params(self):
        for record in self:
            params = record.params
            record.params_store = repr(params) if isinstance(params, dict) else params

    def _get_default_form_view(self):
        doc = super()._get_default_form_view()
        params = doc.find(".//field[@name='params']")
        params.getparent().remove(params)
        params_store = doc.find(".//field[@name='params_store']")
        params_store.getparent().remove(params_store)
        return doc


    def _get_readable_fields(self):
        return super()._get_readable_fields() | {
            "context", "params", "res_model", "tag", "target",
        }
