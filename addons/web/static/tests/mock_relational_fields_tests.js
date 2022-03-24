/** @odoo-module **/

import MockServer from 'web.MockServer';

QUnit.module('web', {}, function () {
QUnit.module('mock_relational_fields_tests.js', {
    beforeEach() {
        this.data = {
            foo: {
                fields: {
                    one2many_field: { type: 'one2many', relation: 'bar', inverse: 'many2one_field' },
                    many2one_field: { type: 'many2one', relation: 'bar', inverse: 'one2many_field' },
                    many2many_field: { type: 'many2many', relation: 'bar', inverse: 'many2many_field' },
                    many2one_reference: { type: 'many2one_reference', model_name_ref_fname: 'res_model', inverse_fname_by_model_name: { bar: 'one2many_field' } },
                    res_model: { type: 'char' },

                },
                records: [],
            },
            bar: {
                fields: {
                    many2one_field: { type: 'many2one', relation: 'foo' },
                    one2many_field: { type: 'one2many', relation: 'foo', inverse: 'many2one_field' },
                    many2many_field: { type: 'many2many', relation: 'foo', inverse: 'many2many_field' },
                },
                records: [],
            },
        };
    }
});

QUnit.test('many2one_ref should auto fill inverse field', async function (assert) {
    this.data['bar'].records.push({ id: 1 });
    this.data['foo'].records.push({
        id: 2,
        res_model: 'bar',
        many2one_reference: 1,
    });
    const mockServer = new MockServer(this.data, {});
    assert.deepEqual([2], mockServer.data['bar'].records[0].one2many_field);

    mockServer._mockUnlink('foo', [2]);
    assert.deepEqual([], mockServer.data['bar'].records[0].one2many_field);
});

QUnit.test('many2one should auto fill inverse field', async function (assert) {
    this.data['bar'].records.push({ id: 1 });
    this.data['foo'].records.push({
        id: 2,
        many2one_field: 1,
    });
    const mockServer = new MockServer(this.data, {});
    assert.deepEqual([2], mockServer.data['bar'].records[0].one2many_field);

    mockServer._mockUnlink('foo', [2]);
    assert.deepEqual([], mockServer.data['bar'].records[0].one2many_field);
});

QUnit.test('one2many should auto fill inverse field', async function (assert) {
    this.data['bar'].records.push({ id: 1 });
    this.data['bar'].records.push({ id: 2 });
    this.data['foo'].records.push({
        id: 3,
        one2many_field: [1, 2],
    });
    const mockServer = new MockServer(this.data, {});
    assert.equal(3, mockServer.data['bar'].records[0].many2one_field);
    assert.equal(3, mockServer.data['bar'].records[1].many2one_field);

    mockServer._mockUnlink('foo', [3]);
    assert.equal(false, mockServer.data['bar'].records[0].many2one_field);
    assert.equal(false, mockServer.data['bar'].records[1].many2one_field);
});

QUnit.test('many2many should auto fill inverse field', async function (assert) {
    this.data['bar'].records.push({ id: 1 });
    this.data['foo'].records.push({
        id: 2,
        many2many_field: [1],
    });
    const mockServer = new MockServer(this.data, {});
    assert.deepEqual([2], mockServer.data['bar'].records[0].many2many_field);

    mockServer._mockUnlink('foo', [2]);
    assert.deepEqual([], mockServer.data['bar'].records[0].many2many_field);
});

});
