import argparse
import odoo
import logging


from odoo.tools.misc import topological_sort


CALLBACKS = ('button_immediate_install', 'button_immediate_uninstall')
BLACKLIST = {
    'auth_ldap', 'document_ftp', 'base_gengo', 'website_gengo', 'website_instantclick', 'pad',
    'pad_project', 'note_pad', 'pos_cache', 'pos_blackbox_be', 'base', 'payment_test',
}
IGNORE = ('hw_', 'theme_', 'l10n_', 'test_')


def _call_on_mod(mod_id, callback, db):
    assert callback in CALLBACKS, f"_call_on_mod only accepts {CALLBACKS} as arguments"
    with odoo.api.Environment.manage():
        with odoo.registry(db).cursor() as cr:
            env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {})
            mod = env['ir.module.module'].browse(mod_id)
            name = mod.name
            getattr(mod, callback)()
    return name


def _install(mod_id, db):
    name = _call_on_mod(mod_id, 'button_immediate_install', db)
    print(f"{name} installed")


def _uninstall(mod_id, db):
    name = _call_on_mod(mod_id, 'button_immediate_uninstall', db)
    print(f"{name} uninstalled")


def cycle(mod_id, db):
    _install(mod_id, db)
    _uninstall(mod_id, db)
    _install(mod_id, db)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Script for testing the install / uninstall / reinstall cycle of Odoo modules")
    parser.add_argument("--database", "-d", type=str, nargs=1, required=True,
        help="The database to test (note: must have only 'base' installed)")
    parser.add_argument("--skip", "-s", type=str, nargs=1,
        help="Comma-separated list of modules to skip (they will only be installed)")
    return parser.parse_args()


def main():
    args = parse_args()
    with odoo.api.Environment.manage():
        with odoo.registry(args.database[0]).cursor() as cr:
            env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {})

            def filter_mod(mod):
                return not (mod.name in BLACKLIST or mod.name.startswith(IGNORE))

            mods = env['ir.module.module'].search([]).filtered(filter_mod)
            sorted_mods = topological_sort({
                mod.id: mod.dependencies_id.mapped('depend_id').ids for mod in mods
            })
            mod_names = {mod.id: mod.name for mod in mods}

    for mod in sorted_mods:
        if args.skip and mod_names[mod] in args.skip[0].split(','):
            _install(mod, args.database[0])
        else:
            cycle(mod, args.database[0])

if __name__ == '__main__':
    main()
