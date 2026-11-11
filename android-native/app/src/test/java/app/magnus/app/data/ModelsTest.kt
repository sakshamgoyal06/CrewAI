package app.magnus.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelsTest {
    @Test
    fun readsTodayAndIgnoresFieldsTheAppDoesNotKnow() {
        val json = """
            {"timezone":"Asia/Kolkata","brandNew":{"x":1},
             "today":{"date":"2026-11-11","checks":[{"id":"steps","label":"Steps","met":false,"progress":0.42,"detail":"3,400 of 8,000"}],
                      "onTrack":false,"score":42.5,"calories":1234.5,"proteinG":80,"steps":3400,"stepsFromPhone":true,
                      "walkMinutes":null,"sleepMinutes":412,"restingHr":61,"totalKcal":null,"hrvMs":null,"isTrainingDay":true,
                      "routine":[{"itemId":"a","label":"Gym","activityKey":"gym","startTime":"18:00","durationMin":60,"gym":true,"state":"pending","detail":"6:00 pm"}]},
             "northStar":{"onTrackDays":3,"unloggedDays":1,"partialDays":0,"pausedDays":0,"windowDays":7,"goal":5,
                          "days":[{"date":"2026-11-10","onTrack":false,"unlogged":true,"score":0,"checks":[]}],"mostMissed":null},
             "targets":{"calorieTarget":2200,"proteinTarget":165,"stepTarget":8000,"trainingDays":[1,3,5],"minMealSessions":3},
             "mealList":{"date":"2026-11-11","rows":[{"key":"lunch","slot":"lunch","state":"eaten","text":"Dal, rice","items":[],
                          "totals":{"kcal":540,"proteinG":22,"carbsG":80,"fatG":12}}],"done":1,"planned":4,"extras":0,
                          "eaten":{"kcal":540,"proteinG":22,"carbsG":80,"fatG":12},"toEat":{"kcal":1500,"proteinG":120,"carbsG":150,"fatG":50}},
             "hevyConnected":true}
        """.trimIndent()
        val s = MagnusJson.decodeFromString(TodaySnapshot.serializer(), json)
        assertEquals(3, s.northStar.onTrackDays)
        assertTrue(s.northStar.days.single().unlogged)
        assertEquals(3400.0, s.today.steps, 0.0)
        assertEquals("18:00", s.today.routine.single().startTime)
        assertEquals("eaten", s.mealList!!.rows.single().state)
        assertEquals(2200.0, s.targets.calorieTarget!!, 0.0)
    }

    @Test
    fun readsConfigWithAndWithoutTheGoogleClientId() {
        val with = MagnusJson.decodeFromString(ConfigResponse.serializer(), """{"auth":{"supabaseUrl":"https://x.supabase.co","supabaseKey":"k","google":true,"googleClientId":"id"}}""")
        assertEquals("id", with.auth.googleClientId)
        val without = MagnusJson.decodeFromString(ConfigResponse.serializer(), """{"auth":{"supabaseUrl":null,"supabaseKey":null,"google":false}}""")
        assertEquals(null, without.auth.googleClientId)
    }
}
