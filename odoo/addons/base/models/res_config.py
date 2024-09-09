# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
import re
from ast import literal_eval

from odoo import api, models, _
from odoo.exceptions import AccessError, RedirectWarning, UserError

_logger = logging.getLogger(__name__)


class ResConfigModuleInstallationMixin(object):
    __slots__ = ()

    @api.model
    def _install_modules(self, modules):
        """ Install the requested modules.

        :param modules: a recordset of ir.module.module records
        :return: the next action to execute
        """
        result = None

        to_install_modules = modules.filtered(lambda module: module.state == 'uninstalled')
        if to_install_modules:
            result = to_install_modules.button_immediate_install()

        return result


class ResConfig(models.TransientModel):
    ''' Base classes for new-style configuration items

    Configuration items should inherit from this class, implement
    the execute method (and optionally the cancel one) and have
    their view inherit from the related res_config_view_base view.
    '''
    _name = 'res.config'
    _description = 'Config'

    def start(self):
        # pylint: disable=next-method-called
        return self.next()

    def next(self):
        """
        Reload the settings page
        """
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def execute(self):
        """ Method called when the user clicks on the ``Next`` button.

        Execute *must* be overloaded unless ``action_next`` is overloaded
        (which is something you generally don't need to do).

        If ``execute`` returns an action dictionary, that action is executed
        rather than just going to the next configuration item.
        """
        raise NotImplementedError(
            'Configuration items need to implement execute')

    def cancel(self):
        """ Method called when the user click on the ``Skip`` button.

        ``cancel`` should be overloaded instead of ``action_skip``. As with
        ``execute``, if it returns an action dictionary that action is
        executed in stead of the default (going to the next configuration item)

        The default implementation is a NOOP.

        ``cancel`` is also called by the default implementation of
        ``action_cancel``.
        """
        pass

    def action_next(self):
        """ Action handler for the ``next`` event.

        Sets the status of the todo the event was sent from to
        ``done``, calls ``execute`` and -- unless ``execute`` returned
        an action dictionary -- executes the action provided by calling
        ``next``.
        """
        # pylint: disable=next-method-called
        return self.execute() or self.next()

    def action_skip(self):
        """ Action handler for the ``skip`` event.

        Sets the status of the todo the event was sent from to
        ``skip``, calls ``cancel`` and -- unless ``cancel`` returned
        an action dictionary -- executes the action provided by calling
        ``next``.
        """
        # pylint: disable=next-method-called
        return self.cancel() or self.next()

    def action_cancel(self):
        """ Action handler for the ``cancel`` event. That event isn't
        generated by the res.config.view.base inheritable view, the
        inherited view has to overload one of the buttons (or add one
        more).

        Sets the status of the todo the event was sent from to
        ``cancel``, calls ``cancel`` and -- unless ``cancel`` returned
        an action dictionary -- executes the action provided by calling
        ``next``.
        """
        # pylint: disable=next-method-called
        return self.cancel() or self.next()


class ResConfigSettings(models.TransientModel, ResConfigModuleInstallationMixin):
    """ Base configuration wizard for application settings.  It provides support for setting
        default values, assigning groups to employee users, and installing modules.
        To make such a 'settings' wizard, define a model like::

            class MyConfigWizard(models.TransientModel):
                _name = 'my.settings'
                _inherit = ['res.config.settings']

                default_foo = fields.type(..., default_model='my.model'),
                group_bar = fields.Boolean(..., group='base.group_user', implied_group='my.group'),
                module_baz = fields.Boolean(...),
                config_qux = fields.Char(..., config_parameter='my.parameter')
                other_field = fields.type(...),

        The method ``execute`` provides some support based on a naming convention:

        *   For a field like 'default_XXX', ``execute`` sets the (global) default value of
            the field 'XXX' in the model named by ``default_model`` to the field's value.

        *   For a boolean field like 'group_XXX', ``execute`` adds/removes 'implied_group'
            to/from the implied groups of 'group', depending on the field's value.
            By default 'group' is the group Employee.  Groups are given by their xml id.
            The attribute 'group' may contain several xml ids, separated by commas.

        *   For a selection field like 'group_XXX' composed of 2 string values ('0' and '1'),
            ``execute`` adds/removes 'implied_group' to/from the implied groups of 'group',
            depending on the field's value.
            By default 'group' is the group Employee.  Groups are given by their xml id.
            The attribute 'group' may contain several xml ids, separated by commas.

        *   For a boolean field like 'module_XXX', ``execute`` triggers the immediate
            installation of the module named 'XXX' if the field has value ``True``.

        *   For a selection field like 'module_XXX' composed of 2 string values ('0' and '1'),
            ``execute`` triggers the immediate installation of the module named 'XXX'
            if the field has the value ``'1'``.

        *   For a field with no specific prefix BUT an attribute 'config_parameter',
            ``execute``` will save its value in an ir.config.parameter (global setting for the
            database).

        *   For the other fields, the method ``execute`` invokes `set_values`.
            Override it to implement the effect of those fields.

        The method ``default_get`` retrieves values that reflect the current status of the
        fields like 'default_XXX', 'group_XXX', 'module_XXX' and config_XXX.
        It also invokes all methods with a name that starts with 'get_default_';
        such methods can be defined to provide current values for other fields.
    """
    _name = 'res.config.settings'
    _description = 'Config Settings'

    def _valid_field_parameter(self, field, name):
        return (
            name in ('default_model', 'config_parameter')
            or field.type in ('boolean', 'selection') and name in ('group', 'implied_group')
            or super()._valid_field_parameter(field, name)
        )

    def copy(self, default=None):
        raise UserError(_("Cannot duplicate configuration!"))

    def onchange_module(self, field_value, module_name):
        module_sudo = self.env['ir.module.module']._get(module_name[7:])
        if not int(field_value) and module_sudo.state in ('to install', 'installed', 'to upgrade'):
            deps = module_sudo.downstream_dependencies()
            dep_names = (deps | module_sudo).mapped('shortdesc')
            message = '\n'.join(dep_names)
            return {
                'warning': {
                    'title': _('Warning!'),
                    'message': _('Disabling this option will also uninstall the following modules \n%s', message),
                }
            }
        return {}

    def _register_hook(self):
        """ Add an onchange method for each module field. """
        def make_method(name):
            return lambda self: self.onchange_module(self[name], name)

        for name in self._fields:
            if name.startswith('module_'):
                method = make_method(name)
                self._onchange_methods[name].append(method)

    @api.model
    def _get_classified_fields(self, fnames=None):
        """ return a dictionary with the fields classified by category::

                {   'default': [('default_foo', 'model', 'foo'), ...],
                    'group':   [('group_bar', [browse_group], browse_implied_group), ...],
                    'module':  [('module_baz', browse_module), ...],
                    'config':  [('config_qux', 'my.parameter'), ...],
                    'other':   ['other_field', ...],
                }
        """
        IrModule = self.env['ir.module.module']
        IrModelData = self.env['ir.model.data']
        Groups = self.env['res.groups']

        def ref(xml_id):
            res_model, res_id = IrModelData._xmlid_to_res_model_res_id(xml_id)
            return self.env[res_model].browse(res_id)

        if fnames is None:
            fnames = self._fields.keys()

        defaults, groups, configs, others = [], [], [], []
        modules = IrModule
        for name in fnames:
            field = self._fields[name]
            if name.startswith('default_'):
                if not hasattr(field, 'default_model'):
                    raise Exception("Field %s without attribute 'default_model'" % field)
                defaults.append((name, field.default_model, name[8:]))
            elif name.startswith('group_'):
                if field.type not in ('boolean', 'selection'):
                    raise Exception("Field %s must have type 'boolean' or 'selection'" % field)
                if not hasattr(field, 'implied_group'):
                    raise Exception("Field %s without attribute 'implied_group'" % field)
                field_group_xmlids = getattr(field, 'group', 'base.group_user').split(',')
                field_groups = Groups.concat(*(ref(it) for it in field_group_xmlids))
                groups.append((name, field_groups, ref(field.implied_group)))
            elif name.startswith('module_'):
                if field.type not in ('boolean', 'selection'):
                    raise Exception("Field %s must have type 'boolean' or 'selection'" % field)
                modules += IrModule._get(name[7:])
            elif hasattr(field, 'config_parameter') and field.config_parameter:
                if field.type not in ('boolean', 'integer', 'float', 'char', 'selection', 'many2one', 'datetime'):
                    raise Exception("Field %s must have type 'boolean', 'integer', 'float', 'char', 'selection', 'many2one' or 'datetime'" % field)
                configs.append((name, field.config_parameter))
            else:
                others.append(name)

        return {'default': defaults, 'group': groups, 'module': modules, 'config': configs, 'other': others}

    def get_values(self):
        """
        Return values for the fields other that `default`, `group` and `module`
        """
        return {}

    @api.model
    def default_get(self, fields):
        res = super().default_get(fields)
        if not fields:
            return res

        IrDefault = self.env['ir.default']
        IrConfigParameter = self.env['ir.config_parameter'].sudo()
        classified = self._get_classified_fields(fields)

        # defaults: take the corresponding default value they set
        for name, model, field in classified['default']:
            value = IrDefault._get(model, field)
            if value is not None:
                res[name] = value

        # groups: which groups are implied by the group Employee
        for name, groups, implied_group in classified['group']:
            res[name] = all(implied_group in group.all_implied_ids for group in groups)
            if self._fields[name].type == 'selection':
                res[name] = str(int(res[name]))     # True, False -> '1', '0'

        # modules: which modules are installed/to install
        for module in classified['module']:
            res[f'module_{module.name}'] = module.state in ('installed', 'to install', 'to upgrade')

        # config: get & convert stored ir.config_parameter (or default)
        WARNING_MESSAGE = "Error when converting value %r of field %s for ir.config.parameter %r"
        for name, icp in classified['config']:
            field = self._fields[name]
            value = IrConfigParameter.get_param(icp, field.default(self) if field.default else False)
            if value is not False:
                if field.type == 'many2one':
                    try:
                        # Special case when value is the id of a deleted record, we do not want to
                        # block the settings screen
                        value = self.env[field.comodel_name].browse(int(value)).exists().id
                    except (ValueError, TypeError):
                        _logger.warning(WARNING_MESSAGE, value, field, icp)
                        value = False
                elif field.type == 'integer':
                    try:
                        value = int(value)
                    except (ValueError, TypeError):
                        _logger.warning(WARNING_MESSAGE, value, field, icp)
                        value = 0
                elif field.type == 'float':
                    try:
                        value = float(value)
                    except (ValueError, TypeError):
                        _logger.warning(WARNING_MESSAGE, value, field, icp)
                        value = 0.0
                elif field.type == 'boolean':
                    value = bool(value)
            res[name] = value

        res.update(self.get_values())

        return res

    def set_values(self):
        """
        Set values for the fields other that `default`, `group` and `module`
        """
        self = self.with_context(active_test=False)
        classified = self._get_classified_fields()
        current_settings = self.default_get(list(self.fields_get()))

        # default values fields
        IrDefault = self.env['ir.default'].sudo()
        for name, model, field in classified['default']:
            if isinstance(self[name], models.BaseModel):
                if self._fields[name].type == 'many2one':
                    value = self[name].id
                else:
                    value = self[name].ids
            else:
                value = self[name]
            if name not in current_settings or value != current_settings[name]:
                IrDefault.set(model, field, value)

        # group fields: modify group / implied groups
        for name, groups, implied_group in sorted(classified['group'], key=lambda k: self[k[0]]):
            groups = groups.sudo()
            implied_group = implied_group.sudo()
            if self[name] == current_settings[name]:
                continue
            if int(self[name]):
                groups._apply_group(implied_group)
            else:
                groups._remove_group(implied_group)

        # config fields: store ir.config_parameters
        IrConfigParameter = self.env['ir.config_parameter'].sudo()
        for name, icp in classified['config']:
            field = self._fields[name]
            value = self[name]
            current_value = IrConfigParameter.get_param(icp)

            if field.type == 'char':
                # storing developer keys as ir.config_parameter may lead to nasty
                # bugs when users leave spaces around them
                value = (value or "").strip() or False
            elif field.type in ('integer', 'float'):
                value = repr(value) if value else False
            elif field.type == 'many2one':
                # value is a (possibly empty) recordset
                value = value.id

            if current_value == str(value) or current_value == value:
                continue
            IrConfigParameter.set_param(icp, value)

    def execute(self):
        """
        Called when settings are saved.

        This method will call `set_values` and will install/uninstall any modules defined by
        `module_` Boolean fields and then trigger a web client reload.

        .. warning::

            This method **SHOULD NOT** be overridden, in most cases what you want to override is
            `~set_values()` since `~execute()` does little more than simply call `~set_values()`.

            The part that installs/uninstalls modules **MUST ALWAYS** be at the end of the
            transaction, otherwise there's a big risk of registry <-> database desynchronisation.
        """
        self.ensure_one()
        if not self.env.is_admin():
            raise AccessError(_("Only administrators can change the settings"))

        self = self.with_context(active_test=False)
        classified = self._get_classified_fields()

        self.set_values()

        # module fields: install/uninstall the selected modules
        to_install = classified['module'].filtered(
            lambda m: self[f'module_{m.name}'] and m.state != 'installed')
        to_uninstall = classified['module'].filtered(
            lambda m: not self[f'module_{m.name}'] and m.state in ('installed', 'to upgrade'))

        if to_install or to_uninstall:
            self.env.flush_all()

        if to_uninstall:
            to_uninstall.button_immediate_uninstall()

        installation_status = self._install_modules(to_install)

        if installation_status or to_uninstall:
            # After the uninstall/install calls, the registry and environments
            # are no longer valid. So we reset the environment.
            self.env.transaction.reset()

        # pylint: disable=next-method-called
        config = self.env['res.config'].next() or {}
        if config.get('type') not in ('ir.actions.act_window_close',):
            return config

        # force client-side reload (update user menu and current view)
        return {
            'type': 'ir.actions.client',
            'tag': 'reload',
        }

    def cancel(self):
        # ignore the current record, and send the action to reopen the view
        actions = self.env['ir.actions.act_window'].search([('res_model', '=', self._name)], limit=1)
        if actions:
            return actions.read()[0]
        return {}

    def _compute_display_name(self):
        """ Override display_name method to return an appropriate configuration wizard
        name, and not the generated name."""
        action = self.env['ir.actions.act_window'].search([('res_model', '=', self._name)], limit=1)
        self.display_name = action.name or self._name

    @api.model
    def get_option_path(self, menu_xml_id):
        """
        Fetch the path to a specified configuration view and the action id to access it.

        :param string menu_xml_id: the xml id of the menuitem where the view is located,
            structured as follows: module_name.menuitem_xml_id (e.g.: "sales_team.menu_sale_config")
        :return tuple:
            - t[0]: string: full path to the menuitem (e.g.: "Settings/Configuration/Sales")
            - t[1]: int or long: id of the menuitem's action
        """
        ir_ui_menu = self.env.ref(menu_xml_id)
        return (ir_ui_menu.complete_name, ir_ui_menu.action.id)

    @api.model
    def get_option_name(self, full_field_name):
        """
        Fetch the human readable name of a specified configuration option.

        :param string full_field_name: the full name of the field, structured as follows:
            model_name.field_name (e.g.: "sale.config.settings.fetchmail_lead")
        :return string: human readable name of the field (e.g.: "Create leads from incoming mails")
        """
        model_name, field_name = full_field_name.rsplit('.', 1)
        return self.env[model_name].fields_get([field_name])[field_name]['string']

    @api.model
    def get_config_warning(self, msg):
        """
        Helper: return a Warning exception with the given message where the %(field:xxx)s
        and/or %(menu:yyy)s are replaced by the human readable field's name and/or menuitem's
        full path.

        Usage:
        ------
        Just include in your error message %(field:model_name.field_name)s to obtain the human
        readable field's name, and/or %(menu:module_name.menuitem_xml_id)s to obtain the menuitem's
        full path.

        Example of use:
        ---------------
        from odoo.addons.base.models.res_config import get_warning_config
        raise get_warning_config(cr, _("Error: this action is prohibited. You should check the field %(field:sale.config.settings.fetchmail_lead)s in %(menu:sales_team.menu_sale_config)s."), context=context)

        This will return an exception containing the following message:
            Error: this action is prohibited. You should check the field Create leads from incoming mails in Settings/Configuration/Sales.

        What if there is another substitution in the message already?
        -------------------------------------------------------------
        You could have a situation where the error message you want to upgrade already contains a substitution. Example:
            Cannot find any account journal of %s type for this company.\n\nYou can create one in the menu: \nConfiguration\\Journals\\Journals.
        What you want to do here is simply to replace the path by %menu:account.menu_account_config)s, and leave the rest alone.
        In order to do that, you can use the double percent (%%) to escape your new substitution, like so:
            Cannot find any account journal of %s type for this company.\n\nYou can create one in the %%(menu:account.menu_account_config)s.
        """
        self = self.sudo()

        # Process the message
        # 1/ find the menu and/or field references, put them in a list
        regex_path = r'%\(((?:menu|field):[a-z_\.]*)\)s'
        references = re.findall(regex_path, msg, flags=re.I)

        # 2/ fetch the menu and/or field replacement values (full path and
        #    human readable field's name) and the action_id if any
        values = {}
        action_id = None
        for item in references:
            ref_type, ref = item.split(':')
            if ref_type == 'menu':
                values[item], action_id = self.get_option_path(ref)
            elif ref_type == 'field':
                values[item] = self.get_option_name(ref)

        # 3/ substitute and return the result
        if (action_id):
            return RedirectWarning(msg % values, action_id, _('Go to the configuration panel'))
        return UserError(msg % values)

    @api.model_create_multi
    def create(self, vals_list):
        # Optimisation: saving a res.config.settings even without changing any
        # values will trigger the write of all related values. This in turn may
        # trigger chain of further recomputation. To avoid it, delete values
        # that were not changed.
        for vals in vals_list:
            for field in self._fields.values():
                if not (field.name in vals and field.related and not field.readonly):
                    continue
                # we write on a related field like
                # qr_code = fields.Boolean(related='company_id.qr_code', readonly=False)
                fname0, *fnames = field.related.split(".")
                if fname0 not in vals:
                    continue

                # determine the current value
                field0 = self._fields[fname0]
                old_value = field0.convert_to_record(
                    field0.convert_to_cache(vals[fname0], self), self)
                for fname in fnames:
                    old_value = next(iter(old_value), old_value)[fname]

                # determine the new value
                new_value = field.convert_to_record(
                    field.convert_to_cache(vals[field.name], self), self)

                # drop if the value is the same
                if old_value == new_value:
                    vals.pop(field.name)

        return super().create(vals_list)

    def action_open_template_user(self):
        action = self.env["ir.actions.actions"]._for_xml_id("base.action_res_users")
        template_user_id = literal_eval(self.env['ir.config_parameter'].sudo().get_param('base.template_portal_user_id', 'False'))
        template_user = self.env['res.users'].browse(template_user_id)
        if not template_user.exists():
            raise UserError(_('Invalid template user. It seems it has been deleted.'))
        action['res_id'] = template_user_id
        action['views'] = [[self.env.ref('base.view_users_form').id, 'form']]
        return action
