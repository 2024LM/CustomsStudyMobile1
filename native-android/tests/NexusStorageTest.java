package com.nexus.customsstudy;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.lang.reflect.Method;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class NexusStorageTest {
    private SQLiteDatabase db;
    private NexusStoragePlugin plugin;
    private Method sync;

    @Before public void setup() throws Exception {
        db = SQLiteDatabase.create(null);
        db.setForeignKeyConstraintsEnabled(true);
        Class<?> helper = Class.forName("com.nexus.customsstudy.NexusStoragePlugin$StudyDatabaseHelper");
        Method create = helper.getDeclaredMethod("createNormalizedTables", SQLiteDatabase.class);
        create.setAccessible(true);
        create.invoke(null, db);
        plugin = new NexusStoragePlugin();
        sync = NexusStoragePlugin.class.getDeclaredMethod("replaceNormalizedData", SQLiteDatabase.class, JSONObject.class);
        sync.setAccessible(true);
        db.execSQL("CREATE TABLE audit (table_name TEXT)");
        for (String table : new String[]{"questions", "settings", "question_states"}) {
            db.execSQL("CREATE TRIGGER audit_" + table + " AFTER UPDATE ON " + table
                + " BEGIN INSERT INTO audit VALUES ('" + table + "'); END");
        }
    }
    @After public void cleanup() { db.close(); }

    private JSONObject snapshot() throws Exception {
        JSONObject root = new JSONObject();
        root.put("domains", new JSONArray().put(new JSONObject().put("id", "domain").put("name", "Domain")));
        root.put("banks", new JSONArray().put(new JSONObject().put("id", "bank").put("domainId", "domain")));
        root.put("questions", new JSONArray().put(new JSONObject().put("rowId", 1).put("bankId", "bank").put("question", "Question")));
        root.put("questionStates", new JSONObject().put("1", new JSONObject().put("questionRowId", 1).put("favorite", false)));
        root.put("settings", new JSONObject().put("daily_goal", "20"));
        root.put("sessions", new JSONArray().put(new JSONObject().put("id", 1).put("bankId", "bank")));
        root.put("attempts", new JSONArray().put(new JSONObject().put("id", 1).put("questionRowId", 1).put("sessionId", 1)));
        root.put("notifications", new JSONArray().put(new JSONObject().put("id", "notice").put("title", "Notice")));
        return root;
    }

    private void save(JSONObject root) throws Exception {
        db.beginTransaction();
        try {
            sync.invoke(plugin, db, root);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    private int count(String table) {
        try (Cursor c = db.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            c.moveToFirst(); return c.getInt(0);
        }
    }

    @Test public void unchangedSnapshotDoesNotRewriteRows() throws Exception {
        JSONObject root = snapshot();
        save(root);
        save(root);
        assertEquals(0, count("audit"));
        assertEquals(1, count("questions"));
        assertEquals(1, count("attempts"));
    }

    @Test public void editsUpdateOnlyChangedRowsAndPreserveRelations() throws Exception {
        JSONObject root = snapshot();
        save(root);
        root.getJSONObject("settings").put("daily_goal", "30");
        root.getJSONObject("questionStates").getJSONObject("1").put("favorite", true);
        save(root);
        assertEquals(2, count("audit"));
        try (Cursor c = db.rawQuery("SELECT favorite FROM question_states WHERE question_row_id=1", null)) {
            c.moveToFirst(); assertEquals(1, c.getInt(0));
        }
        try (Cursor c = db.rawQuery("SELECT * FROM pragma_foreign_key_check", null)) {
            assertEquals(0, c.getCount());
        }
        assertEquals(1, count("attempts"));
    }

    @Test public void removingBankDeletesChildrenWithoutForeignKeyErrors() throws Exception {
        save(snapshot());
        JSONObject empty = new JSONObject();
        for (String key : new String[]{"domains", "banks", "questions", "sessions", "attempts", "notifications"}) {
            empty.put(key, new JSONArray());
        }
        empty.put("settings", new JSONObject());
        empty.put("questionStates", new JSONObject());
        save(empty);
        assertEquals(0, count("banks"));
        assertEquals(0, count("questions"));
        assertEquals(0, count("attempts"));
    }

    @Test public void invalidSnapshotRollsBackWithoutLosingSavedData() throws Exception {
        save(snapshot());
        JSONObject invalid = snapshot();
        invalid.getJSONArray("questions").getJSONObject(0).put("bankId", "missing");
        try { save(invalid); fail("Invalid bank reference should fail"); }
        catch (Exception expected) {}
        assertEquals(1, count("questions"));
        try (Cursor c = db.rawQuery("SELECT bank_id FROM questions WHERE row_id=1", null)) {
            c.moveToFirst(); assertEquals("bank", c.getString(0));
        }
    }
}
