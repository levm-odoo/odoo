import csv
import sys
from pathlib import Path

from odoo.cli.command import Command
# from odoo.modules.module import get_modules
from odoo.tools.misc import file_open
from odoo.tools.translate import trans_export, load_language


"""
    Import, export, setup internationalization (i18n) files.

    ADDONS="odoo,odoo/odoo,enterprise"
    MODULES="l10n_it l10n_it_edi"

    sample usage:
        odoo/odoo-bin --addons-path=$ADDONS i18n setup  --community
        odoo/odoo-bin --addons-path=$ADDONS i18n export --community


"""

class Subcommand:
    def __init__(self, subparsers, name, description):
        self.env = None
        self.subparsers = subparsers
        self.name = name
        self.description = description

    def config(self):
        parser = self.subparsers.add_parser(self.name.lower(), help=self.description)
        parser.add_argument(
            '--database', '-d', dest='db_name', default='temp_i18n',
            help="Specify the database name")
        modules_group = parser.add_argument_group('Module options (mutually exclusive)')
        target = modules_group.add_mutually_exclusive_group()
        target.add_argument('--modules', '-m', dest='modules', default='', nargs='*', metavar='MODULE,...',
            help=("Comma-separated list of modules to be exported"))
        target.add_argument('--community', dest='community', action='store_true',
            help=(f"{self.name} all community modules"))
        target.add_argument('--enterprise', dest='enterprise', action='store_true',
            help=(f"{self.name} all enterprise modules"))
        target.add_argument('--all', dest='all', action='store_true',
            help=(f"{self.name} all modules"))
        return parser

    def check(self, parsed_args):
        self.args = parsed_args
        if not parsed_args.db_name:
            sys.exit("Please fill out the database option (--database/-d)")
        parsed_args.modules = [x for x in parsed_args.modules if x.strip()]

    def run(self):
        raise NotImplementedError()


class ExportSubcommand(Subcommand):
    def config(self):
        parser = super().config()
        parser.add_argument('--lang', '-l', dest='lang', default='pot', metavar='LANG,...',
            help=("Comma-separated list of language ISO codes to be exported, 'pot' for template"))
        parser.add_argument(
            '--format', '-f', dest='format', default='po', choices=('po', 'tgz', 'csv'),
            help=("Export format"))
        return parser

    def check(self, parsed_args):
        super().check(parsed_args)
        parsed_args.lang = [x for x in parsed_args.lang.split(',') if x.strip()]

    def run(self):
        print("Exporting i18n files\n")
        lang, modules = self.args.lang, self.args.modules
        ResLang = self.env['res.lang'].with_context(active_test=False)
        res_languages = ResLang.search_fetch(
            [] if lang == '*' else ['|', ('code', 'in', lang), ('iso_code', 'in', lang)],
            ['code', 'iso_code']
        )
        for res_language in res_languages:
            load_language(self.env.cr, res_language.code)
        for module in modules:
            if lang_codes := (
                ([(None, f"{module}.pot")] if 'pot' in lang else [])
                + res_languages.mapped(lambda lang: (lang.code, f"{lang.iso_code}.po"))
            ):
                basepath = Path(module) / "i18n"
                for lang_code, filename in lang_codes:
                    with file_open(str(basepath / filename), "wb") as outfile:
                        print(f"{basepath.absolute()}/{filename}")
                        trans_export(lang_code, [module], outfile, self.args.format, self.env.cr)


class I18n(Command):
    """ Import, export, setup internationalization (i18n) files. """

    def run(self, cmdargs):
        if subcommand := self.setup(cmdargs):
            with self.build_env(subcommand.args.db_name):
                subcommand.env = self.env
                subcommand.run()
        else:
            self.parser.print_help()
            sys.exit()

    def _monkeypatch_csv(self):
        """ The default limit for CSV fields in the module is 128KiB, which is not
            quite sufficient to import images to store in attachment. 500MiB is a
            bit overkill, but better safe than sorry"""
        csv.field_size_limit(500 * 2 ** 20)

    def setup(self, cmdargs):
        subparsers = self.parser.add_subparsers(dest='subcommand', help='Subcommands help')
        subcommands = {
            'export': ExportSubcommand(subparsers, "Export", "Export i18n files"),
            # 'import': ImportSubcommand(subparsers, "Import", "Import i18n files"),
            # 'setup': SetupSubcommand(subparsers, "Setup", "Setup Odoo for i18n operations"),
        }
        for subcommand in subcommands.values():
            subcommand.config()
        parsed_args, _unknown = self.parser.parse_known_args(args=cmdargs)
        if parsed_args.format == 'csv':
            self._monkeypatch_csv()
        subcommand.check(parsed_args)
        return subcommands[parsed_args.subcommand]

    # - Have a flag to *install* all modules you want to export
    # - Allow to pass 'community' or 'enterprise' as names to export all community or enterprise modules
    # - Something to take into account. When exporting e.g. account.pot, you can't have
    # any l10n_ module installed, since otherwise all records created by the l10n
    # (like accounts, taxes ...) will be included in account.pot. It might be a bit
    # tricky.

    # def import_translation():
    #     config = odoo.tools.config
    #     overwrite = config["overwrite_existing_translations"]
    #     dbnames = config['db_name']
    #     if len(dbnames) > 1:
    #         sys.exit("-d/--database/db_name has multiple database, please provide a single one")
    #     registry = odoo.modules.registry.Registry.new(dbnames[0])
    #     with registry.cursor() as cr:
    #         translation_importer = odoo.tools.translate.TranslationImporter(cr)
    #         translation_importer.load_file(config["translate_in"], config["language"])
    #         translation_importer.save(overwrite=overwrite)
