package com.ardia.phone

import android.app.AlertDialog
import android.content.Context
import android.content.DialogInterface
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.view.ContextThemeWrapper
import android.view.GestureDetector
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.Menu
import android.view.MotionEvent
import android.widget.PopupMenu
import com.facebook.react.uimanager.events.NativeGestureUtil
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class MenuItemRecord : Record {
    @Field val id: String = ""

    @Field val title: String = ""

    @Field val subtitle: String? = null

    @Field val systemImage: String? = null

    @Field val destructive: Boolean = false

    @Field val disabled: Boolean = false

    @Field val checked: Boolean = false

    @Field val inline: Boolean = false

    @Field val children: List<MenuItemRecord>? = null
}

class MenuAppearanceRecord : Record {
    @Field val dark: Boolean? = null
}

class ActionSheetActionRecord : Record {
    @Field val id: String = ""

    @Field val title: String = ""

    @Field val destructive: Boolean = false

    @Field val cancel: Boolean = false
}

class ActionSheetRecord : Record {
    @Field val title: String? = null

    @Field val message: String? = null

    @Field val actions: List<ActionSheetActionRecord> = emptyList()

    @Field val appearance: MenuAppearanceRecord? = null
}

internal object NativeMenuRules {
    const val ARGUMENT = "ArdiaNativeMenus"

    data class Item(val id: String, val title: String, val subtitle: String?, val destructive: Boolean, val disabled: Boolean, val checked: Boolean, val children: List<Row>?)

    sealed interface Row {
        val group: Int
    }

    data class Header(val title: String, override val group: Int) : Row

    data class Action(val item: Item, override val group: Int) : Row

    data class MenuItemShape(val id: String, val title: String, val subtitle: String? = null, val destructive: Boolean = false, val disabled: Boolean = false, val checked: Boolean = false, val inline: Boolean = false, val children: List<MenuItemShape>? = null)

    fun shape(record: MenuItemRecord): MenuItemShape =
        MenuItemShape(record.id, record.title, record.subtitle, record.destructive, record.disabled, record.checked, record.inline, record.children?.map(::shape))

    fun rows(items: List<MenuItemShape>): List<Row> {
        val rows = mutableListOf<Row>()
        var group = 0
        for (item in items) {
            val children = item.children
            if (children != null && item.inline) {
                group += 1
                if (item.title.isNotEmpty()) rows += Header(item.title, group)
                rows += rows(children).map { child -> if (child is Action) child.copy(group = group) else (child as Header).copy(group = group) }
                group += 1
                continue
            }
            val nested = children?.let(::rows)
            rows += Action(Item(item.id, item.title, item.subtitle, item.destructive, item.disabled, item.checked, nested), group)
        }
        return rows
    }

    data class Sheet(val buttons: List<ActionSheetActionShape>, val listed: List<ActionSheetActionShape>, val cancelTitle: String)

    data class ActionSheetActionShape(val id: String, val title: String, val destructive: Boolean = false, val cancel: Boolean = false)

    fun sheet(actions: List<ActionSheetActionShape>, defaultCancel: String = "Cancel"): Sheet {
        val choices = actions.filterNot { it.cancel }
        val cancelTitle = actions.firstOrNull { it.cancel }?.title ?: defaultCancel
        return if (choices.size <= 2) Sheet(choices, emptyList(), cancelTitle) else Sheet(emptyList(), choices, cancelTitle)
    }

    fun asked(arguments: Map<String, Any>): Boolean = arguments[ARGUMENT] == true

    fun destructiveColour(dark: Boolean): Int = if (dark) 0xFFFF453A.toInt() else 0xFFFF3B30.toInt()
}

internal object NativeMenuStyle {
    fun themed(context: Context, dark: Boolean?): Context = when (dark) {
        true -> ContextThemeWrapper(context, android.R.style.Theme_DeviceDefault)
        false -> ContextThemeWrapper(context, android.R.style.Theme_DeviceDefault_Light)
        null -> context
    }

    fun isDark(context: Context, dark: Boolean?): Boolean =
        dark ?: ((context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES)

    fun title(item: NativeMenuRules.Item, dark: Boolean): CharSequence {
        val text = SpannableStringBuilder(item.title)
        if (item.destructive) text.setSpan(ForegroundColorSpan(NativeMenuRules.destructiveColour(dark)), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        val subtitle = item.subtitle?.takeIf { it.isNotEmpty() } ?: return text
        val start = text.length + 1
        text.append('\n').append(subtitle)
        text.setSpan(RelativeSizeSpan(0.85f), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return text
    }

    fun header(title: String): CharSequence = SpannableStringBuilder(title).apply { setSpan(StyleSpan(Typeface.BOLD), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
}

class NativeContextMenuView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val onSelect by EventDispatcher()
    private val onOpen by EventDispatcher()
    private val onClose by EventDispatcher()

    internal var items: List<NativeMenuRules.MenuItemShape> = emptyList()
    var trigger: String = "longPress"
    var dark: Boolean? = null
    private var showing: PopupMenu? = null
    private var order = 0

    private val gestures = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            override fun onSingleTapUp(event: MotionEvent): Boolean {
                if (trigger != "tap") return false
                show(event)
                return true
            }

            override fun onLongPress(event: MotionEvent) {
                if (trigger == "tap") return
                performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                show(event)
            }
        },
    )

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) =
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (items.isNotEmpty()) gestures.onTouchEvent(event)
        return super.dispatchTouchEvent(event)
    }

    fun showFromCode() = show(null)

    private fun show(event: MotionEvent?) {
        if (items.isEmpty() || showing != null) return
        if (event != null) {
            NativeGestureUtil.notifyNativeGestureStarted(this, event)
            parent?.requestDisallowInterceptTouchEvent(true)
        }
        val darkMenu = NativeMenuStyle.isDark(context, dark)
        val popup = PopupMenu(NativeMenuStyle.themed(context, dark), this, Gravity.NO_GRAVITY)
        val ids = HashMap<Int, String>()
        order = 0
        fill(popup.menu, NativeMenuRules.rows(items), ids, darkMenu)
        popup.menu.setGroupDividerEnabled(true)
        popup.setOnMenuItemClickListener { item ->
            val id = ids[item.itemId] ?: return@setOnMenuItemClickListener false
            onSelect(mapOf("id" to id))
            true
        }
        popup.setOnDismissListener {
            showing = null
            onClose(emptyMap())
        }
        showing = popup
        popup.show()
        onOpen(emptyMap())
    }

    private fun fill(menu: Menu, rows: List<NativeMenuRules.Row>, ids: HashMap<Int, String>, dark: Boolean) {
        for (row in rows) {
            order += 1
            when (row) {
                is NativeMenuRules.Header -> menu.add(row.group, Menu.NONE, order, NativeMenuStyle.header(row.title)).isEnabled = false
                is NativeMenuRules.Action -> {
                    val item = row.item
                    val children = item.children
                    if (children != null) {
                        val sub = menu.addSubMenu(row.group, Menu.NONE, order, NativeMenuStyle.title(item, dark))
                        sub.item.isEnabled = !item.disabled
                        fill(sub, children, ids, dark)
                    } else {
                        val itemId = ids.size + 1
                        ids[itemId] = item.id
                        menu.add(row.group, itemId, order, NativeMenuStyle.title(item, dark)).apply {
                            isEnabled = !item.disabled
                            if (item.checked) {
                                isCheckable = true
                                isChecked = true
                            }
                        }
                    }
                }
            }
        }
    }

    fun dismissMenu() {
        showing?.dismiss()
    }

    override fun onDetachedFromWindow() {
        dismissMenu()
        super.onDetachedFromWindow()
    }
}

class MenusModule : Module() {
    private fun nativeMenusAsked(): Boolean = NativeMenuRules.asked(LaunchExtras.arguments(LaunchExtras.of(appContext.currentActivity?.intent)))

    override fun definition() = ModuleDefinition {
        Name("ArdiaPhoneMenus")

        Constants {
            val asked = nativeMenusAsked()
            mapOf("hasContextMenu" to asked, "hasActionSheet" to asked)
        }

        AsyncFunction("actionSheet") { options: ActionSheetRecord, promise: Promise ->
            val activity = appContext.currentActivity
            if (activity == null || activity.isFinishing) {
                promise.resolve(null)
                return@AsyncFunction
            }
            val dark = NativeMenuStyle.isDark(activity, options.appearance?.dark)
            val sheet = NativeMenuRules.sheet(options.actions.map { NativeMenuRules.ActionSheetActionShape(it.id, it.title, it.destructive, it.cancel) })
            var answered = false
            val answer = { id: String? ->
                if (!answered) {
                    answered = true
                    promise.resolve(id)
                }
            }
            val builder = AlertDialog.Builder(NativeMenuStyle.themed(activity, options.appearance?.dark))
            options.title?.takeIf { it.isNotEmpty() }?.let(builder::setTitle)
            if (sheet.listed.isEmpty()) {
                options.message?.takeIf { it.isNotEmpty() }?.let(builder::setMessage)
                sheet.buttons.getOrNull(0)?.let { first -> builder.setPositiveButton(first.title) { _, _ -> answer(first.id) } }
                sheet.buttons.getOrNull(1)?.let { second -> builder.setNeutralButton(second.title) { _, _ -> answer(second.id) } }
            } else {
                val titles = sheet.listed.map { action ->
                    if (action.destructive) {
                        SpannableStringBuilder(action.title).apply { setSpan(ForegroundColorSpan(NativeMenuRules.destructiveColour(dark)), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
                    } else {
                        action.title
                    }
                }.toTypedArray<CharSequence>()
                builder.setItems(titles) { _, which -> answer(sheet.listed[which].id) }
            }
            builder.setNegativeButton(sheet.cancelTitle) { _, _ -> answer(null) }
            builder.setOnDismissListener { answer(null) }
            val dialog = builder.create()
            dialog.show()
            sheet.buttons.forEachIndexed { index, action ->
                if (!action.destructive) return@forEachIndexed
                val which = if (index == 0) DialogInterface.BUTTON_POSITIVE else DialogInterface.BUTTON_NEUTRAL
                dialog.getButton(which)?.setTextColor(NativeMenuRules.destructiveColour(dark))
            }
        }.runOnQueue(Queues.MAIN)

        View(NativeContextMenuView::class) {
            Events("onSelect", "onOpen", "onClose")

            Prop("items") { view: NativeContextMenuView, items: List<MenuItemRecord> -> view.items = items.map(NativeMenuRules::shape) }

            Prop("trigger") { view: NativeContextMenuView, value: String? -> view.trigger = if (value == "tap") "tap" else "longPress" }

            Prop("fixedOrder") { _: NativeContextMenuView, _: Boolean? -> }

            Prop("appearance") { view: NativeContextMenuView, value: MenuAppearanceRecord? -> view.dark = value?.dark }

            AsyncFunction("show") { view: NativeContextMenuView -> view.showFromCode() }.runOnQueue(Queues.MAIN)
        }
    }
}
