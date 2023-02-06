odoo.define('web.field_registry', function (require) {
    "use strict";

    const Registry = require('web.Registry');

    const { Component } = owl;

    return new Registry(
        null,
        (value) => !(value.prototype instanceof Component)
    );
});

odoo.define('web._field_registry', function (require) {
"use strict";

var AbstractField = require('web.AbstractField');
var basic_fields = require('web.basic_fields');
var relational_fields = require('web.relational_fields');
var registry = require('web.field_registry');

// Basic fields
registry
    .add('abstract', AbstractField)
    .add('input', basic_fields.InputField)
    .add('integer', basic_fields.FieldInteger)
    .add('boolean', basic_fields.FieldBoolean)
    .add('date', basic_fields.FieldDate)
    .add('datetime', basic_fields.FieldDateTime)
    .add('daterange', basic_fields.FieldDateRange)
    .add('remaining_days', basic_fields.RemainingDays)
    .add('float', basic_fields.FieldFloat)
    .add('char', basic_fields.FieldChar)
    .add('handle', basic_fields.HandleWidget)
    .add('email', basic_fields.FieldEmail)
    .add('phone', basic_fields.FieldPhone)
    .add('url', basic_fields.UrlWidget)
    .add('image_url', basic_fields.CharImageUrl)
    .add('kanban.image_url', basic_fields.KanbanCharImageUrl)
    .add('binary', basic_fields.FieldBinaryFile)
    .add('monetary', basic_fields.FieldMonetary)
    .add('percentage', basic_fields.FieldPercentage)
    .add('priority', basic_fields.PriorityWidget)
    .add('attachment_image', basic_fields.AttachmentImage)
    .add('label_selection', basic_fields.LabelSelection)
    .add('boolean_favorite', basic_fields.FavoriteWidget)
    .add('boolean_toggle', basic_fields.BooleanToggle)
    .add('float_time', basic_fields.FieldFloatTime)
    .add('float_factor', basic_fields.FieldFloatFactor)
    .add('float_toggle', basic_fields.FieldFloatToggle)
    .add('progressbar', basic_fields.FieldProgressBar)
    .add('dashboard_graph', basic_fields.JournalDashboardGraph)
    .add('many2one_reference', basic_fields.FieldInteger)

// Relational fields
registry
    .add('many2one', relational_fields.FieldMany2One)
    .add('many2one_avatar', relational_fields.Many2OneAvatar)
    .add('many2many_tags', relational_fields.FieldMany2ManyTags)
    .add('many2many_tags_avatar', relational_fields.FieldMany2ManyTagsAvatar)
    .add('kanban.many2many_tags_avatar', relational_fields.KanbanMany2ManyTagsAvatar)
    .add('list.many2many_tags_avatar', relational_fields.ListMany2ManyTagsAvatar)
    .add('form.many2many_tags', relational_fields.FormFieldMany2ManyTags)
    .add('radio', relational_fields.FieldRadio)
    .add('selection', relational_fields.FieldSelection);

});