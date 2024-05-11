use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};

#[derive(Debug)]
pub enum SqliteValue {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

impl ToSql for SqliteValue {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match self {
            SqliteValue::Null => Ok(ToSqlOutput::Borrowed(ValueRef::Null)),
            SqliteValue::Integer(i) => Ok(ToSqlOutput::from(*i)),
            SqliteValue::Real(f) => Ok(ToSqlOutput::from(*f)),
            SqliteValue::Text(s) => Ok(ToSqlOutput::from(s.as_str())),
            SqliteValue::Blob(b) => Ok(ToSqlOutput::from(b.as_slice())),
        }
    }
}

impl FromSql for SqliteValue {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value {
            ValueRef::Null => Ok(SqliteValue::Null),
            ValueRef::Integer(i) => Ok(SqliteValue::Integer(i)),
            ValueRef::Real(f) => Ok(SqliteValue::Real(f)),
            ValueRef::Text(s) => Ok(SqliteValue::Text(
                std::str::from_utf8(s)
                    .map_err(|e| FromSqlError::Other(Box::new(e)))?
                    .to_string(),
            )),
            ValueRef::Blob(b) => Ok(SqliteValue::Blob(b.to_vec())),
        }
    }
}

// Implement serde::Serialize for SqliteValue.
impl serde::Serialize for SqliteValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            SqliteValue::Null => serializer.serialize_none(),
            SqliteValue::Integer(i) => serializer.serialize_i64(*i),
            SqliteValue::Real(f) => serializer.serialize_f64(*f),
            SqliteValue::Text(s) => serializer.serialize_str(s),
            SqliteValue::Blob(b) => serializer.serialize_bytes(b),
        }
    }
}

// Implement serde::Deserialize for SqliteValue.
impl<'de> serde::Deserialize<'de> for SqliteValue {
    fn deserialize<D>(deserializer: D) -> Result<SqliteValue, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct SqliteValueVisitor;

        impl<'de> serde::de::Visitor<'de> for SqliteValueVisitor {
            type Value = SqliteValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("an SQLite value")
            }

            fn visit_unit<E>(self) -> Result<SqliteValue, E> {
                Ok(SqliteValue::Null)
            }

            fn visit_none<E>(self) -> Result<SqliteValue, E> {
                Ok(SqliteValue::Null)
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
                Ok(SqliteValue::Integer(v as i64))
            }

            fn visit_i64<E>(self, v: i64) -> Result<SqliteValue, E> {
                Ok(SqliteValue::Integer(v))
            }

            fn visit_f64<E>(self, v: f64) -> Result<SqliteValue, E> {
                Ok(SqliteValue::Real(v))
            }

            fn visit_str<E>(self, v: &str) -> Result<SqliteValue, E>
            where
                E: serde::de::Error,
            {
                Ok(SqliteValue::Text(v.to_string()))
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<SqliteValue, E>
            where
                E: serde::de::Error,
            {
                Ok(SqliteValue::Blob(v.to_vec()))
            }
        }

        deserializer.deserialize_any(SqliteValueVisitor)
    }
}
