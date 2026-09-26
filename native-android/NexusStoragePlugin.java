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

import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NexusStorage")
public class NexusStoragePlugin extends Plugin {
    private static final String DATABASE_NAME = "customs_study_core.db";
    private static final int DATABASE_VERSION = 1;
    private static final String STATE_KEY = "database";
    private static final int MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

    private StudyDatabaseHelper helper;

    @Override
    public void load() {
        super.load();
        Context context = getContext();
        helper = new StudyDatabaseHelper(context.getApplicationContext());
    }

    @PluginMethod
    public void loadSnapshot(PluginCall call) {
        try {
            SQLiteDatabase db = helper.getReadableDatabase();
            try (Cursor cursor = db.query(
                    "app_state",
                    new String[]{"payload"},
                    "id = ?",
                    new String[]{STATE_KEY},
                    null,
                    null,
                    null,
                    "1"
            )) {
                JSObject result = new JSObject();
                result.put("value", cursor.moveToFirst() ? cursor.getString(0) : null);
                call.resolve(result);
            }
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
            db = helper.getWritableDatabase();
            db.beginTransaction();

            ContentValues values = new ContentValues();
            values.put("id", STATE_KEY);
            values.put("payload", value);
            values.put("updated_at", System.currentTimeMillis());

            long rowId = db.insertWithOnConflict(
                    "app_state",
                    null,
                    values,
                    SQLiteDatabase.CONFLICT_REPLACE
            );

            if (rowId == -1) {
                throw new IllegalStateException("SQLite rejected the database snapshot");
            }

            db.setTransactionSuccessful();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to save local database", error);
        } finally {
            if (db != null && db.inTransaction()) {
                db.endTransaction();
            }
        }
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
            db.execSQL(
                    "CREATE TABLE IF NOT EXISTS app_state (" +
                    "id TEXT PRIMARY KEY NOT NULL," +
                    "payload TEXT NOT NULL," +
                    "updated_at INTEGER NOT NULL" +
                    ")"
            );
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Schema migrations will be added here incrementally.
        }
    }
}
