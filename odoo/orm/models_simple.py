from odoo import SUPERUSER_ID
from .models import BaseModel, LOG_ACCESS_COLUMNS
from .fields_relational import Many2one
from .fields_temporal import Datetime

AbstractModel = BaseModel


class SimpleModel(AbstractModel):
    """ Main super-class for regular database-persisted Odoo models.

    Odoo models are created by inheriting from this class::

        class ResUsers(Model):
            ...

    The system will later instantiate the class once per database (on
    which the class' module is installed).
    """
    _auto = True                # automatically create database backend
    _register = False           # not visible in ORM registry, meant to be python-inherited only
    _abstract = False           # not abstract
    _transient = False          # not transient


class LogAccessMixin(AbstractModel):
    _log_access = True  # TODO deprecate

    create_uid = Many2one('res.users', string='Created by', readonly=True)
    create_date = Datetime(string='Created on', readonly=True)
    write_uid = Many2one('res.users', string='Last Updated by', readonly=True)
    write_date = Datetime(string='Last Updated on', readonly=True)

    def get_metadata(self):
        res_access = self.read(LOG_ACCESS_COLUMNS)
        res_parent = super().get_metadata()
        for a, b in zip(res_access, res_parent):
            assert a['id'] == b['id']
            a.update(b)
        return res_access

    def write(self, vals):
        # the superuser can set log_access fields while loading registry
        if not (self.env.uid == SUPERUSER_ID and not self.pool.ready):
            bad_names = set(LOG_ACCESS_COLUMNS)  # XXX make a set (twice)
            vals = {key: val for key, val in vals.items() if key not in bad_names}
        vals.setdefault('write_uid', self.env.uid)
        vals.setdefault('write_date', self.env.cr.now())
        return super().write(vals)

    def _prepare_create_values(self, vals_list):
        # the superuser can set log_access fields while loading registry
        if not vals_list:
            return super()._prepare_create_values(vals_list)
        if not (self.env.uid == SUPERUSER_ID and not self.pool.ready):
            bad_names = set(LOG_ACCESS_COLUMNS)
        else:
            bad_names = {}
        default_vals = {
            'create_uid': self.env.uid,
            'create_date': self.env.cr.now(),
            'write_uid': self.env.uid,
            'write_date': self.env.cr.now(),
        }
        for vals in vals_list:
            for bad_name in bad_names:
                vals.pop(bad_name, None)
            vals.update(default_vals)
        return super()._prepare_create_values(vals_list)

    def _write_multi(self, vals_list):
        log_vals = {'write_uid': self.env.uid, 'write_date': self.env.cr.now()}
        vals_list = [(log_vals | vals) for vals in vals_list]
        return super()._write_multi(vals_list)


class Model(SimpleModel, LogAccessMixin):
    pass
