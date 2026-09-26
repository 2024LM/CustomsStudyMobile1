package com.nexus.customsstudy;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NexusStorage")
public class NexusStoragePlugin extends Plugin {
    private static final String DATABASE_NAME = "customs_study_core.db";
    private static final int DATABASE_VERSION = 2;
    private static final String LEGACY_STATE_KEY = "database";
    private static final int MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

    private StudyDatabaseHelper helper;

    @Override
    public void load() {
        super.load();
        helper = new StudyDatabaseHelper(getContext().getApplicationContext());
    }

    @PluginMethod
    public void loadSnapshot(PluginCall call) {
        try {
            SQLiteDatabase db = helper.getReadableDatabase();
            String value = hasNormalizedData(db)
                    ? buildSnapshotFromTables(db).toString()
                    : loadLegacySnapshot(db);

            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read local database", error);
        }
    }

    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("Missing database snapshot");
            return;
        }

        int byteSize = value.getBytes(StandardCharsets.UTF_8).length;
        if (byteSize > MAX_SNAPSHOT_BYTES) {
            call.reject("Database snapshot exceeds the 50 MB safety limit");
            return;
        }

        SQLiteDatabase db = null;
        try {
            JSONObject root = new JSONObject(value);
            db = helper.getWritableDatabase();
            db.beginTransaction();

            replaceNormalizedData(db, root);

            // Keep one transactional recovery copy while the normalized schema matures.
            ContentValues backup = new ContentValues();
            backup.put("id", LEGACY_STATE_KEY);
            backup.put("payload", value);
            backup.put("updated_at", System.currentTimeMillis());
            db.insertWithOnConflict("app_state", null, backup, SQLiteDatabase.CONFLICT_REPLACE);

            db.setTransactionSuccessful();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to save local database", error);
        } finally {
            if (db != null && db.inTransaction()) db.endTransaction();
        }
    }

    private boolean hasNormalizedData(SQLiteDatabase db) {
        try (Cursor cursor = db.rawQuery("SELECT COUNT(*) FROM domains", null)) {
            return cursor.moveToFirst() && cursor.getLong(0) > 0;
        }
    }

    private String loadLegacySnapshot(SQLiteDatabase db) {
        try (Cursor cursor = db.query(
                "app_state",
                new String[]{"payload"},
                "id = ?",
                new String[]{LEGACY_STATE_KEY},
                null,
                null,
                null,
                "1"
        )) {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }

    private void replaceNormalizedData(SQLiteDatabase db, JSONObject root) throws Exception {
        db.delete("attempts", null, null);
        db.delete("question_states", null, null);
        db.delete("questions", null, null);
        db.delete("sessions", null, null);
        db.delete("banks", null, null);
        db.delete("domains", null, null);
        db.delete("settings", null, null);
        db.delete("notifications", null, null);

        JSONArray domains = root.optJSONArray("domains");
        if (domains != null) {
            for (int i = 0; i < domains.length(); i++) {
                JSONObject item = domains.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("id", item.getString("id"));
                v.put("name", item.optString("name", ""));
                v.put("description", item.optString("description", ""));
                v.put("enabled", item.optBoolean("enabled", true) ? 1 : 0);
                v.put("built_in", item.optBoolean("builtIn", false) ? 1 : 0);
                v.put("created_at", item.optLong("createdAt", 0));
                ensureInsert(db, "domains", v);
            }
        }

        JSONArray banks = root.optJSONArray("banks");
        if (banks != null) {
            for (int i = 0; i < banks.length(); i++) {
                JSONObject item = banks.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("id", item.getString("id"));
                v.put("domain_id", item.getString("domainId"));
                v.put("name", item.optString("name", ""));
                v.put("description", item.optString("description", ""));
                v.put("version", item.optInt("version", 1));
                v.put("format_version", item.optInt("formatVersion", 1));
                v.put("built_in", item.optBoolean("builtIn", false) ? 1 : 0);
                v.put("enabled", item.optBoolean("enabled", true) ? 1 : 0);
                v.put("imported_at", item.optLong("importedAt", 0));
                v.put("source_name", item.optString("sourceName", ""));
                ensureInsert(db, "banks", v);
            }
        }

        JSONArray questions = root.optJSONArray("questions");
        if (questions != null) {
            for (int i = 0; i < questions.length(); i++) {
                JSONObject item = questions.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("row_id", item.getLong("rowId"));
                v.put("bank_id", item.getString("bankId"));
                v.put("external_id", item.optString("externalId", ""));
                v.put("question", item.optString("question", ""));
                v.put("correct_answer", item.optString("correctAnswer", ""));
                v.put("wrong1", item.optString("wrong1", ""));
                v.put("wrong2", item.optString("wrong2", ""));
                v.put("wrong3", item.optString("wrong3", ""));
                v.put("explanation", item.optString("explanation", ""));
                v.put("topic", item.optString("topic", ""));
                v.put("source_date", item.optString("sourceDate", ""));
                v.put("question_type", item.optString("questionType", "QCM"));
                v.put("qcm_status", item.optString("qcmStatus", "NOT_READY"));
                v.put("enabled", item.optBoolean("enabled", true) ? 1 : 0);
                ensureInsert(db, "questions", v);
            }
        }

        JSONArray sessions = root.optJSONArray("sessions");
        if (sessions != null) {
            for (int i = 0; i < sessions.length(); i++) {
                JSONObject item = sessions.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("id", item.getLong("id"));
                v.put("started_at", item.optLong("startedAt", 0));
                putNullableLong(v, "finished_at", item, "finishedAt");
                v.put("requested_count", item.optInt("requestedCount", 0));
                v.put("answered_count", item.optInt("answeredCount", 0));
                v.put("correct_count", item.optInt("correctCount", 0));
                v.put("mode", item.optString("mode", ""));
                v.put("bank_id", item.optString("bankId", ""));
                JSONArray ids = item.optJSONArray("questionRowIds");
                v.put("question_row_ids", ids == null ? "[]" : ids.toString());
                ensureInsert(db, "sessions", v);
            }
        }

        JSONObject states = root.optJSONObject("questionStates");
        if (states != null) {
            JSONArray keys = states.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String key = keys.getString(i);
                    JSONObject item = states.getJSONObject(key);
                    ContentValues v = new ContentValues();
                    v.put("question_row_id", item.optLong("questionRowId", Long.parseLong(key)));
                    v.put("favorite", item.optBoolean("favorite", false) ? 1 : 0);
                    v.put("times_seen", item.optInt("timesSeen", 0));
                    v.put("correct_count", item.optInt("correctCount", 0));
                    v.put("wrong_count", item.optInt("wrongCount", 0));
                    v.put("streak", item.optInt("streak", 0));
                    putNullableLong(v, "last_answered_at", item, "lastAnsweredAt");
                    putNullableLong(v, "next_review_at", item, "nextReviewAt");
                    ensureInsert(db, "question_states", v);
                }
            }
        }

        JSONArray attempts = root.optJSONArray("attempts");
        if (attempts != null) {
            for (int i = 0; i < attempts.length(); i++) {
                JSONObject item = attempts.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("id", item.getLong("id"));
                v.put("question_row_id", item.getLong("questionRowId"));
                v.put("selected_answer", item.optString("selectedAnswer", ""));
                v.put("is_correct", item.optBoolean("isCorrect", false) ? 1 : 0);
                v.put("answered_at", item.optLong("answeredAt", 0));
                putNullableLong(v, "session_id", item, "sessionId");
                ensureInsert(db, "attempts", v);
            }
        }

        JSONObject settings = root.optJSONObject("settings");
        if (settings != null) {
            JSONArray keys = settings.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String key = keys.getString(i);
                    ContentValues v = new ContentValues();
                    v.put("key", key);
                    v.put("value", settings.optString(key, ""));
                    ensureInsert(db, "settings", v);
                }
            }
        }

        JSONArray notifications = root.optJSONArray("notifications");
        if (notifications != null) {
            for (int i = 0; i < notifications.length(); i++) {
                JSONObject item = notifications.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put("id", item.getString("id"));
                v.put("title", item.optString("title", ""));
                v.put("message", item.optString("message", ""));
                putNullableString(v, "type", item, "type");
                putNullableString(v, "date", item, "date");
                putNullableString(v, "url", item, "url");
                v.put("received_at", item.optLong("receivedAt", 0));
                putNullableLong(v, "read_at", item, "readAt");
                v.put("source", item.optString("source", "local"));
                ensureInsert(db, "notifications", v);
            }
        }
    }

    private JSONObject buildSnapshotFromTables(SQLiteDatabase db) throws Exception {
        JSONObject root = new JSONObject();
        root.put("domains", readDomains(db));
        root.put("banks", readBanks(db));
        root.put("questions", readQuestions(db));
        root.put("attempts", readAttempts(db));
        root.put("questionStates", readQuestionStates(db));
        root.put("sessions", readSessions(db));
        root.put("settings", readSettings(db));
        root.put("notifications", readNotifications(db));
        return root;
    }

    private JSONArray readDomains(SQLiteDatabase db) throws Exception {
        JSONArray out = new JSONArray();
        try (Cursor c = db.rawQuery("SELECT id,name,description,enabled,built_in,created_at FROM domains ORDER BY created_at,id", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getString(0));
                o.put("name", c.getString(1));
                o.put("description", c.getString(2));
                o.put("enabled", c.getInt(3) == 1);
                o.put("builtIn", c.getInt(4) == 1);
                o.put("createdAt", c.getLong(5));
                out.put(o);
            }
        }
        return out;
    }

    private JSONArray readBanks(SQLiteDatabase db) throws Exception {
        JSONArray out = new JSONArray();
        try (Cursor c = db.rawQuery("SELECT id,domain_id,name,description,version,format_version,built_in,enabled,imported_at,source_name FROM banks ORDER BY imported_at,id", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getString(0));
                o.put("domainId", c.getString(1));
                o.put("name", c.getString(2));
                o.put("description", c.getString(3));
                o.put("version", c.getInt(4));
                o.put("formatVersion", c.getInt(5));
                o.put("builtIn", c.getInt(6) == 1);
                o.put("enabled", c.getInt(7) == 1);
                o.put("importedAt", c.getLong(8));
                o.put("sourceName", c.getString(9));
                out.put(o);
            }
        }
        return out;
    }

    private JSONArray readQuestions(SQLiteDatabase db) throws Exception {
        JSONArray out = new JSONArray();
        try (Cursor c = db.rawQuery("SELECT row_id,bank_id,external_id,question,correct_answer,wrong1,wrong2,wrong3,explanation,topic,source_date,question_type,qcm_status,enabled FROM questions ORDER BY row_id", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("rowId", c.getLong(0));
                o.put("bankId", c.getString(1));
                o.put("externalId", c.getString(2));
                o.put("question", c.getString(3));
                o.put("correctAnswer", c.getString(4));
                o.put("wrong1", c.getString(5));
                o.put("wrong2", c.getString(6));
                o.put("wrong3", c.getString(7));
                o.put("explanation", c.getString(8));
                o.put("topic", c.getString(9));
                o.put("sourceDate", c.getString(10));
                o.put("questionType", c.getString(11));
                o.put("qcmStatus", c.getString(12));
                o.put("enabled", c.getInt(13) == 1);
                out.put(o);
            }
        }
        return out;
    }

    private JSONArray readAttempts(SQLiteDatabase db) throws Exception {
        JSONArray out = new JSONArray();
        try (Cursor c = db.rawQuery("SELECT id,question_row_id,selected_answer,is_correct,answered_at,session_id FROM attempts ORDER BY id", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("questionRowId", c.getLong(1));
                o.put("selectedAnswer", c.getString(2));
                o.put("isCorrect", c.getInt(3) == 1);
                o.put("answeredAt", c.getLong(4));
                putJsonNullableLong(o, "sessionId", c, 5);
                out.put(o);
            }
        }
        return out;
    }

    private JSONObject readQuestionStates(SQLiteDatabase db) throws Exception {
        JSONObject out = new JSONObject();
        try (Cursor c = db.rawQuery("SELECT question_row_id,favorite,times_seen,correct_count,wrong_count,streak,last_answered_at,next_review_at FROM question_states ORDER BY question_row_id", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                long id = c.getLong(0);
                o.put("questionRowId", id);
                o.put("favorite", c.getInt(1) == 1);
                o.put("timesSeen", c.getInt(2));
                o.put("correctCount", c.getInt(3));
                o.put("wrongCount", c.getInt(4));
                o.put("streak", c.getInt(5));
                putJsonNullableLong(o, "lastAnsweredAt", c, 6);
                putJsonNullableLong(o, "nextReviewAt", c, 7);
                out.put(String.valueOf(id), o);
            }
        }
        return out;
    }

    private JSONArray readSessions(SQLiteDatabase db) throws Exception {
        JSONArray out = new JSONArray();
        try (Cursor c = db.rawQuery("SELECT id,started_at,finished_at,requested_count,answered_count,correct_count,mode,bank_id,question_row_ids FROM sessions ORDER BY id", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(0));
                o.put("startedAt", c.getLong(1));
                putJsonNullableLong(o, "finishedAt", c, 2);
                o.put("requestedCount", c.getInt(3));
                o.put("answeredCount", c.getInt(4));
                o.put("correctCount", c.getInt(5));
                o.put("mode", c.getString(6));
                o.put("bankId", c.getString(7));
                o.put("questionRowIds", new JSONArray(c.getString(8)));
                out.put(o);
            }
        }
        return out;
    }

    private JSONObject readSettings(SQLiteDatabase db) throws Exception {
        JSONObject out = new JSONObject();
        try (Cursor c = db.rawQuery("SELECT key,value FROM settings", null)) {
            while (c.moveToNext()) out.put(c.getString(0), c.getString(1));
        }
        return out;
    }

    private JSONArray readNotifications(SQLiteDatabase db) throws Exception {
        JSONArray out = new JSONArray();
        try (Cursor c = db.rawQuery("SELECT id,title,message,type,date,url,received_at,read_at,source FROM notifications ORDER BY received_at", null)) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getString(0));
                o.put("title", c.getString(1));
                o.put("message", c.getString(2));
                putJsonNullableString(o, "type", c, 3);
                putJsonNullableString(o, "date", c, 4);
                putJsonNullableString(o, "url", c, 5);
                o.put("receivedAt", c.getLong(6));
                putJsonNullableLong(o, "readAt", c, 7);
                o.put("source", c.getString(8));
                out.put(o);
            }
        }
        return out;
    }

    private void ensureInsert(SQLiteDatabase db, String table, ContentValues values) {
        long rowId = db.insertOrThrow(table, null, values);
        if (rowId == -1) throw new IllegalStateException("SQLite insert failed for " + table);
    }

    private void putNullableLong(ContentValues values, String column, JSONObject object, String key) {
        if (!object.has(key) || object.isNull(key)) values.putNull(column);
        else values.put(column, object.optLong(key));
    }

    private void putNullableString(ContentValues values, String column, JSONObject object, String key) {
        if (!object.has(key) || object.isNull(key)) values.putNull(column);
        else values.put(column, object.optString(key, ""));
    }

    private void putJsonNullableLong(JSONObject object, String key, Cursor cursor, int column) throws Exception {
        object.put(key, cursor.isNull(column) ? JSONObject.NULL : cursor.getLong(column));
    }

    private void putJsonNullableString(JSONObject object, String key, Cursor cursor, int column) throws Exception {
        object.put(key, cursor.isNull(column) ? JSONObject.NULL : cursor.getString(column));
    }

    @Override
    protected void handleOnDestroy() {
        if (helper != null) {
            helper.close();
            helper = null;
        }
        super.handleOnDestroy();
    }

    private static final class StudyDatabaseHelper extends SQLiteOpenHelper {
        StudyDatabaseHelper(Context context) {
            super(context, DATABASE_NAME, null, DATABASE_VERSION);
        }

        @Override
        public void onConfigure(SQLiteDatabase db) {
            super.onConfigure(db);
            db.setForeignKeyConstraintsEnabled(true);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)");
            createNormalizedTables(db);
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            if (oldVersion < 2) createNormalizedTables(db);
        }

        private static void createNormalizedTables(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS domains (id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,enabled INTEGER NOT NULL,built_in INTEGER NOT NULL,created_at INTEGER NOT NULL)");
            db.execSQL("CREATE TABLE IF NOT EXISTS banks (id TEXT PRIMARY KEY NOT NULL,domain_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,version INTEGER NOT NULL,format_version INTEGER NOT NULL,built_in INTEGER NOT NULL,enabled INTEGER NOT NULL,imported_at INTEGER NOT NULL,source_name TEXT NOT NULL,FOREIGN KEY(domain_id) REFERENCES domains(id))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_banks_domain ON banks(domain_id,enabled)");
            db.execSQL("CREATE TABLE IF NOT EXISTS questions (row_id INTEGER PRIMARY KEY NOT NULL,bank_id TEXT NOT NULL,external_id TEXT NOT NULL,question TEXT NOT NULL,correct_answer TEXT NOT NULL,wrong1 TEXT NOT NULL,wrong2 TEXT NOT NULL,wrong3 TEXT NOT NULL,explanation TEXT NOT NULL,topic TEXT NOT NULL,source_date TEXT NOT NULL,question_type TEXT NOT NULL,qcm_status TEXT NOT NULL,enabled INTEGER NOT NULL,FOREIGN KEY(bank_id) REFERENCES banks(id))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions(bank_id,enabled)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(bank_id,topic)");
            db.execSQL("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,requested_count INTEGER NOT NULL,answered_count INTEGER NOT NULL,correct_count INTEGER NOT NULL,mode TEXT NOT NULL,bank_id TEXT NOT NULL,question_row_ids TEXT NOT NULL,FOREIGN KEY(bank_id) REFERENCES banks(id))");
            db.execSQL("CREATE TABLE IF NOT EXISTS question_states (question_row_id INTEGER PRIMARY KEY NOT NULL,favorite INTEGER NOT NULL,times_seen INTEGER NOT NULL,correct_count INTEGER NOT NULL,wrong_count INTEGER NOT NULL,streak INTEGER NOT NULL,last_answered_at INTEGER,next_review_at INTEGER,FOREIGN KEY(question_row_id) REFERENCES questions(row_id))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_states_review ON question_states(next_review_at)");
            db.execSQL("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY NOT NULL,question_row_id INTEGER NOT NULL,selected_answer TEXT NOT NULL,is_correct INTEGER NOT NULL,answered_at INTEGER NOT NULL,session_id INTEGER,FOREIGN KEY(question_row_id) REFERENCES questions(row_id),FOREIGN KEY(session_id) REFERENCES sessions(id))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_row_id,answered_at)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts(session_id)");
            db.execSQL("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)");
            db.execSQL("CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,type TEXT,date TEXT,url TEXT,received_at INTEGER NOT NULL,read_at INTEGER,source TEXT NOT NULL)");
        }
    }
}
