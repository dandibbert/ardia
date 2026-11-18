package com.ardia.phone

import com.ardia.phone.NativeMenuRules.Action
import com.ardia.phone.NativeMenuRules.ActionSheetActionShape
import com.ardia.phone.NativeMenuRules.Header
import com.ardia.phone.NativeMenuRules.MenuItemShape
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeMenuRulesTest {
    @Test
    fun plainItemsShareTheFirstGroupInTheirOrder() {
        val rows = NativeMenuRules.rows(listOf(MenuItemShape("0", "Copy Link"), MenuItemShape("1", "Share")))
        assertEquals(listOf("Copy Link", "Share"), rows.map { (it as Action).item.title })
        assertEquals(setOf(0), rows.map { it.group }.toSet())
    }

    @Test
    fun anInlineGroupBecomesItsOwnDividedGroupWithItsTitleAsAHeader() {
        val rows = NativeMenuRules.rows(
            listOf(
                MenuItemShape("0", "New Tab"),
                MenuItemShape("g1", "Spaces", inline = true, children = listOf(MenuItemShape("1", "Work", checked = true), MenuItemShape("2", "Home"))),
                MenuItemShape("3", "Close All", destructive = true),
            ),
        )
        assertEquals(Header("Spaces", 1), rows[1])
        assertEquals(listOf(1, 1), rows.subList(2, 4).map { it.group })
        assertTrue((rows[2] as Action).item.checked)
        val last = rows.last() as Action
        assertTrue("what follows a group starts another", last.group > 1)
        assertTrue(last.item.destructive)
    }

    @Test
    fun anUntitledInlineGroupIsOnlyADivider() {
        val rows = NativeMenuRules.rows(listOf(MenuItemShape("g0", "", inline = true, children = listOf(MenuItemShape("1", "Reopen")))))
        assertFalse(rows.any { it is Header })
    }

    @Test
    fun aSubmenuKeepsItsChildren() {
        val rows = NativeMenuRules.rows(listOf(MenuItemShape("0", "Send to Device", children = listOf(MenuItemShape("0.0", "Studio"), MenuItemShape("0.1", "MacBook", disabled = true)))))
        val submenu = (rows.single() as Action).item
        assertEquals(listOf("0.0", "0.1"), submenu.children!!.map { (it as Action).item.id })
        assertTrue((submenu.children!![1] as Action).item.disabled)
    }

    @Test
    fun aConfirmationIsAButtonAndCancelAndALongerChoiceIsAList() {
        val confirm = NativeMenuRules.sheet(listOf(ActionSheetActionShape("confirm", "Close All Tabs", destructive = true), ActionSheetActionShape("cancel", "Cancel", cancel = true)))
        assertEquals(listOf("confirm"), confirm.buttons.map { it.id })
        assertEquals("Cancel", confirm.cancelTitle)
        val longer = NativeMenuRules.sheet(listOf(ActionSheetActionShape("a", "One"), ActionSheetActionShape("b", "Two"), ActionSheetActionShape("c", "Three")))
        assertEquals(listOf("a", "b", "c"), longer.listed.map { it.id })
        assertEquals("a sheet without its own Cancel gets one", "Cancel", longer.cancelTitle)
    }

    @Test
    fun androidsOwnMenusAreOnlyAskedForByTheLabArgument() {
        assertTrue(NativeMenuRules.asked(mapOf("ArdiaNativeMenus" to true)))
        assertFalse(NativeMenuRules.asked(emptyMap()))
        assertFalse(NativeMenuRules.asked(LaunchExtras.arguments(mapOf("ArdiaNativeMenus" to true), allowed = false)))
    }
}
