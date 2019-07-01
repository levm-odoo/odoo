(function () {
'use strict';

var TestToolbarColor = class extends we3.AbstractPlugin {
    static get autoInstall () {
        return ['Test', 'TestToolbar', 'Paragraph'];
    }
    constructor () {
        super(...arguments);
        var self = this;
        this.dependencies = ['Test', 'TestToolbar'];

        // range collapsed: ◆
        // range start: ▶
        // range end: ◀

        this.foreColorTests = [
            {
                name: "Click THEME COLORS - ALPHA: default -> alpha theme color",
                content: '<p>dom not to edit</p><p>d▶om t◀o edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-alpha"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d<font class="text-alpha">▶om t◀</font>o edit</p>',
            },
            {
                name: "Click THEME COLORS - BLACK 25: alpha theme color & default -> black 25",
                content: '<p>dom not to edit</p><p>d▶o<font class="text-alpha">m t◀o </font>edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-black-25"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d<font class="text-black-25">▶om t◀</font><font class="text-alpha">o </font>edit</p>',
            },
            {
                name: "Click COMMON COLORS - BLUE #0000FF: black 25 & default -> blue #0000FF",
                content: '<p>dom not to edit</p><p>d▶o<font class="text-black-25">m t◀o </font>edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-#0000FF"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d<font style="color:#0000FF">▶om t◀</font><font class="text-black-25">o </font>edit</p>',
            },
            {
                name: "Click RESET TO DEFAULT: black 25 & default -> default",
                content: '<p>dom not to edit</p><p>d▶o<font class="text-black-25">m t◀o </font>edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-reset"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d▶om t◀<font class="text-black-25">o </font>edit</p>',
            },
            /* {
                name: "Click CUSTOM COLORS then CUSTOM COLOR: blue #0000FF & default -> #875A7B",
                async: true,
                content: '<p>dom not to edit</p><p>do<font style="color: rgb(0, 0, 255);">m to </font>edit</p>',
                start: 'p:eq(1):contents()[0]->1',
                end: 'font:contents()[0]->3',
                do: async function () {
                    var self = this;

                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button:contains("Custom color")'), ['mousedown', 'click']);

                    $('.modal-dialog .o_hex_input').val('#875A7B').change();
                    await testUtils.dom.triggerNativeEvents($('.o_technical_modal .modal-footer .btn-primary:contains("Choose")')[0], ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('[name="Custom colors"] button:last'), ['mousedown', 'click']);

                    assert.deepEqual(wysiwyg.getValue(),
                        '<p>dom not to edit</p><p>d<font style="color: rgb(135, 90, 123);">om t</font><font style="color: rgb(0, 0, 255);">o </font>edit</p>',
                        self.name);
                    var range = weTestUtils.select('font:contents()[0]->0', 'font:contents()[0]->4', $editable);
                    assert.deepEqual(Wysiwyg.getRange($editable[0]).getPoints(), range, self.name + carretTestSuffix);
                },
            },
            {
                name: "Click CUSTOM COLORS then CUSTOM COLOR: change blue input",
                content: '<p>dom to edit</p>',
                start: 'p:contents()[0]->1',
                end: 'p:contents()[0]->6',
                do: async function () {
                    var self = this;

                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button:contains("Custom color")'), ['mousedown', 'click']);

                    $('.modal-dialog .o_blue_input').val('100').change();

                    assert.deepEqual($('.modal-dialog .o_hex_input').val(), '#ff0064', self.name + ' (hex)');
                    assert.deepEqual($('.modal-dialog .o_hue_input').val(), '337', self.name + ' (hue)');

                    await testUtils.dom.triggerNativeEvents($('.o_technical_modal .modal-footer .btn-primary:contains("Choose")')[0], ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('[name="Custom colors"] button:last'), ['mousedown', 'click']);
                },
                test: {
                    content: '<p>d<font style="color: rgb(255, 0, 100);">om to</font> edit</p>',
                    start: 'font:contents()[0]->0',
                    end: 'font:contents()[0]->5',
                },
            },
            {
                name: "CUSTOM COLOR: change hue, saturation and lightness inputs",
                content: '<p>dom to edit</p>',
                start: 'p:contents()[0]->1',
                end: 'p:contents()[0]->6',
                do: async function () {
                    var self = this;

                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button:contains("Custom color")'), ['mousedown', 'click']);

                        $('.modal-dialog .o_hue_input').val('337').change();
                        $('.modal-dialog .o_saturation_input').val('50').change();
                        $('.modal-dialog .o_lightness_input').val('40').change();

                        assert.deepEqual($('.modal-dialog .o_hex_input').val(), '#99335a', self.name + ' (hex)');
                        assert.deepEqual($('.modal-dialog .o_green_input').val(), '51', self.name + ' (green)');

                        await testUtils.dom.triggerNativeEvents($('.o_technical_modal .modal-footer .btn-primary:contains("Choose")')[0], ['mousedown', 'click']);
                        await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('[name="Custom colors"] button:last'), ['mousedown', 'click']);
                },
                test: {
                    content: '<p>d<font style="color: rgb(153, 51, 90);">om to</font> edit</p>',
                    start: 'font:contents()[0]->0',
                    end: 'font:contents()[0]->5',
                },
            },
            {
                name: "CUSTOM COLOR: mousedown on area",
                content: '<p>dom to edit</p>',
                start: 'p:contents()[0]->1',
                end: 'p:contents()[0]->6',
                do: async function () {
                    var self = this;

                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button:contains("Custom color")'), ['mousedown', 'click']);

                        var $area = $('.modal-dialog .o_color_pick_area');
                        var pos = $area.offset();
                        $area.trigger($.Event("mousedown", {
                            which: 1,
                            pageX: pos.left + 50,
                            pageY: pos.top + 50
                        }));
                        $area.trigger('mouseup');

                        assert.deepEqual($('.modal-dialog .o_hex_input').val(), '#cfafaf', self.name + ' (hex)');
                        assert.deepEqual($('.modal-dialog .o_red_input').val(), '207', self.name + ' (red)');
                        assert.deepEqual($('.modal-dialog .o_green_input').val(), '175', self.name + ' (green)');
                        assert.deepEqual($('.modal-dialog .o_blue_input').val(), '175', self.name + ' (blue)');
                        assert.deepEqual($('.modal-dialog .o_hue_input').val(), '0', self.name + ' (hue)');
                        assert.deepEqual($('.modal-dialog .o_saturation_input').val(), '25', self.name + ' (saturation)');
                        assert.deepEqual($('.modal-dialog .o_lightness_input').val(), '75', self.name + ' (lightness)');

                        await testUtils.dom.triggerNativeEvents($('.o_technical_modal .modal-footer .btn-primary:contains("Choose")')[0], ['mousedown', 'click']);
                        await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('[name="Custom colors"] button:last'), ['mousedown', 'click']);
                },
                test: {
                    content: '<p>d<font style="color: rgb(207, 175, 175);">om to</font> edit</p>',
                    start: 'font:contents()[0]->0',
                    end: 'font:contents()[0]->5',
                },
            },
            {
                name: "CUSTOM COLOR: mousedow on sliders",
                content: '<p>dom to edit</p>',
                start: 'p:contents()[0]->1',
                end: 'p:contents()[0]->6',
                do: async function () {
                    var self = this;

                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button:contains("Custom color")'), ['mousedown', 'click']);

                        var $slider1 = $('.modal-dialog .o_slider_pointer');
                        var pos1 = $slider1.offset();
                        $slider1.trigger($.Event("mousedown", {
                            which: 1,
                            pageX: pos1.left,
                            pageY: pos1.top + 50
                        }));
                        $slider1.trigger('mouseup');

                        assert.deepEqual($('.modal-dialog .o_hex_input').val(), '#83ff00', self.name + ' (hex)');

                        var $slider2 = $('.modal-dialog .o_opacity_slider');
                        var pos2 = $slider2.offset();
                        $slider2.trigger($.Event("mousedown", {
                            which: 1,
                            pageX: pos2.left,
                            pageY: pos2.top + 80
                        }));
                        $slider2.trigger('mouseup');

                        assert.deepEqual($('.modal-dialog .o_hue_input').val(), '89', self.name + ' (hue)');
                        assert.deepEqual($('.modal-dialog .o_opacity_input').val(), '60', self.name + ' (opacity)');

                        await testUtils.dom.triggerNativeEvents($('.o_technical_modal .modal-footer .btn-primary:contains("Choose")')[0], ['mousedown', 'click']);
                        await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('[name="Custom colors"] button:last'), ['mousedown', 'click']);
                },
                test: {
                    content: '<p>d<font style="color: rgba(131, 255, 0, 0.6);">om to</font> edit</p>',
                    start: 'font:contents()[0]->0',
                    end: 'font:contents()[0]->5',
                },
            }, */
            {
                name: "Apply a color on a fontawesome",
                content: '<p>dom <i class="fa fa-glass">◆</i>not to edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-#0000FF"]'), ['mousedown', 'click']);
                },
                test: '<p>dom <font style="color:#0000FF">▶<i class="fa fa-glass"></i>◀</font>not to edit</p>',
            },
            {
                name: "Apply a color on a font with text",
                content: '<p>d▶om <i class="fa fa-glass"></i>not to◀ edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-#0000FF"]'), ['mousedown', 'click']);
                },
                test: '<p>d<font style="color:#0000FF">▶om&nbsp;<i class="fa fa-glass"></i>not to◀</font> edit</p>',
            },
            {
                name: "Apply color, then 'a' (no selection)",
                content: '<p>d◆om not to edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-#0000FF"]'), ['mousedown', 'click']);
                    await self.dependencies.TestToolbar.keydown('a', {
                        firstDeselect: true,
                    });
                },
                test: '<p>d<font style="color:#0000FF">a◆</font>om not to edit</p>',
            },
            /* {
                name: "Apply color on two ranges with the same color",
                content: '<p>d▶o<br><span class="toto">       </span>m no◀t to edit</p>',
                do: async function ($editable) {
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-#0000FF"]'), ['mousedown', 'click']);

                    var range = self.dependencies.Test.select('p:contents()[5]->3', 'p:contents()[5]->6');
                    Wysiwyg.setRange(range);
                    var target = range.sc.tagName ? range.sc : range.sc.parentNode;
                    await testUtils.dom.triggerNativeEvents(target, ['mousedown', 'mouseup']);

                    await self.dependencies.Test.triggerNativeEvents(self.foreColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.foreColorDropdown.querySelector('we3-button[name="color-#0000FF"]'), ['mousedown', 'click']);
                },
                test: '<p>d<font style="color: rgb(0, 0, 255);">o</font><br><span class="toto">       </span><font style="color: rgb(0, 0, 255);">m no</font>t t<font style=\"color: rgb(0, 0, 255);\">▶o e◀</font>dit</p>',
            }, */
        ];
        this.bgColorTests = [
            {
                name: "Click THEME COLORS - ALPHA: default -> alpha theme color",
                content: '<p>dom not to edit</p><p>d▶om t◀o edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorDropdown.querySelector('we3-button[name="color-alpha"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d<font class="bg-alpha">▶om t◀</font>o edit</p>',
            },
            {
                name: "Click THEME COLORS - BLACK 25: alpha theme color & default -> black 25",
                content: '<p>dom not to edit</p><p>d▶o<font class="bg-alpha">m t◀o </font>edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorDropdown.querySelector('we3-button[name="color-black-25"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d<font class="bg-black-25">▶om t◀</font><font class="bg-alpha">o </font>edit</p>',
            },
            {
                name: "Click COMMON COLORS - BLUE #0000FF: black 25 & default -> blue #0000FF",
                content: '<p>dom not to edit</p><p>d▶o<font class="bg-black-25">m t◀o </font>edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorDropdown.querySelector('we3-button[name="color-#0000FF"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d<font style="background-color:#0000FF">▶om t◀</font><font class="bg-black-25">o </font>edit</p>',
            },
            {
                name: "Click RESET TO DEFAULT: black 25 & default -> default",
                content: '<p>dom not to edit</p><p>d▶o<font class="bg-black-25">m t◀o </font>edit</p>',
                do: async function () {
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorToggler, ['mousedown', 'click']);
                    await self.dependencies.Test.triggerNativeEvents(self.bgColorDropdown.querySelector('we3-button[name="color-reset"]'), ['mousedown', 'click']);
                },
                test: '<p>dom not to edit</p><p>d▶om t◀<font class="bg-black-25">o </font>edit</p>',
            },
        // {
        //     name: "Click CUSTOM COLORS then CUSTOM COLOR: blue #0000FF & default -> #875A7B",
        //     content: '<p>dom not to edit</p><p>do<font style="background-color: rgb(0, 0, 255);">m to </font>edit</p>',
        //     start: 'p:eq(1):contents()[0]->1',
        //     end: 'font:contents()[0]->3',
        //     async: true,
        //     do: async function () {
        //         testName = "Click CUSTOM COLORS then CUSTOM COLOR: blue #0000FF & default -> #875A7B";

        //         await self.dependencies.Test.triggerNativeEvents(self.bgColorToggler, ['mousedown', 'click']);
        //         await self.dependencies.Test.triggerNativeEvents(self.bgColorDropdown.querySelector('we3-button:contains("Custom color")'), ['mousedown', 'click']);
        //         await testUtils.fields.editAndTrigger($('.modal-dialog .o_hex_input'), '#875A7B', 'change');
        //         await testUtils.dom.triggerNativeEvents($('.o_technical_modal .modal-footer .btn-primary:contains("Choose")')[0], ['mousedown', 'click']);
        //         await testUtils.dom.triggerNativeEvents($bgColorDropdown.find('[name="Custom colors"] button:last')[0], ['mousedown', 'click']);

        //         assert.deepEqual(wysiwyg.getValue(),
        //             '<p>dom not to edit</p><p>d<font style="background-color: rgb(135, 90, 123);">om t</font><font style="background-color: rgb(0, 0, 255);">o </font>edit</p>',
        //             testName);
        //         var range = weTestUtils.select('font:contents()[0]->0',
        //             'font:contents()[0]->4',
        //             $editable);
        //         assert.deepEqual(Wysiwyg.getRange($editable[0]).getPoints(), range, testName + carretTestSuffix);
        //     },
        // },
    ];
        
        this.toolbarTests = this.foreColorTests
            .concat(this.bgColorTests);
    }

    start () {
        this.dependencies.Test.add(this);
        return super.start();
    }

    test (assert) {
        var wysiwyg = document.getElementsByTagName('we3-editor')[0];
        this.foreColorDropdown = wysiwyg.querySelector('we3-dropdown[name="Color"]');
        this.foreColorToggler = this.foreColorDropdown.querySelector('we3-toggler');
        this.bgColorDropdown = wysiwyg.querySelector('we3-dropdown[name="Background color"]');
        this.bgColorToggler = this.bgColorDropdown.querySelector('we3-toggler');
        return this.dependencies.TestToolbar.test(assert, this.toolbarTests);
    }
};

we3.addPlugin('TestToolbarColor', TestToolbarColor);

})();
