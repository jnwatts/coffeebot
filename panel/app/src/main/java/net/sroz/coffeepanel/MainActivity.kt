package net.sroz.coffeepanel

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.android.volley.Request
import com.android.volley.RequestQueue
import com.android.volley.toolbox.StringRequest
import com.android.volley.toolbox.Volley
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.datetime.Clock
import net.sroz.coffeepanel.ui.theme.CoffeePanelTheme
import org.json.JSONObject
import kotlin.math.abs
import kotlin.time.Duration
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

class MainActivity : ComponentActivity() {
    private val _lastCoffee: MutableStateFlow<Duration?> = MutableStateFlow(null)
    val lastCoffee: StateFlow<Duration?> = _lastCoffee
    private var queue: RequestQueue? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        queue = Volley.newRequestQueue(this)
        enableEdgeToEdge()
        setContent {
            CoffeePanelTheme {
                HideSystemBars()
                CoffeeStatus(
                    lastCoffee,
                    onFresh = { action("fresh") },
                    onBrew = { action("brew") }
                )
                LaunchedEffect(this) {
                    updateStatus().collect { status ->
                        try {
                            val o = JSONObject(status)
                            val now = Clock.System.now()
                            val lastCoffee = kotlinx.datetime.Instant.parse(o.getString("last_coffee"))
                            val diff: Duration = now - lastCoffee
                            _lastCoffee.value = diff
                        } catch (e: Exception) {
                            Log.e("UI", e.toString())
                        }
                    }
                }
            }
        }


    }

    fun updateStatus(): Flow<String> = flow {
        var busy = false
        var status: String? = null
        while (true) {
            if (!busy) {
                if (status != null) {
                    emit(status)
                    status = null
                }
                busy = true
//                Log.i("Net", "Get status...")
                val stringRequest = StringRequest(
                    "http://chat.d3engineering.com/coffeebot/status",
                    { response ->
                        run {
//                            Log.i("Net", response)
                            status = response
                            busy = false
                        }
                    },
                    { e ->
                        Log.e("Net", "Failed in getStatus(): $e")
                        busy = false
                    }
                )
                queue!!.add(stringRequest)
            }
            delay(1000L)
        }
    }

    private fun action(v: String) {
        queue!!.add(StringRequest(
            Request.Method.GET,
            "http://chat.d3engineering.com/coffeebot/$v",
            {},
            {}
        ))
    }

}

fun Duration.toFuzzyTime(): String {
    return when {
        inWholeSeconds < 0 ->
            return when {
                inWholeSeconds > -10 -> "just a little bit more..."
                inWholeMinutes >= -1 -> "almost there..."
                inWholeMinutes >= -2 -> "in a few minutes..."
                inWholeHours > -1 -> "in " + abs(inWholeMinutes).toString() + " minutes"
                else -> ""
            }
        inWholeMinutes < 1 -> "just now"
        inWholeHours < 1 -> "$inWholeMinutes minutes ago"
        inWholeDays < 1 -> {
            val hours = inWholeHours
            val minutes = inWholeMinutes % 60
            when {
                hours == 1L && minutes == 0L -> "1 hour ago"
                hours == 1L -> "an hour ago"
                hours > 1 -> "$hours hours ago"
                else -> "$minutes minutes ago"
            }
        }
        inWholeDays == 1L -> "yesterday"
        inWholeDays < 7 -> "$inWholeDays days ago"
        else -> "a while ago" // Or format as absolute date
    }
}

@Composable
fun CoffeeStatus(
    lastCoffee: StateFlow<Duration?>,
    onFresh: () -> Unit = {},
    onBrew: () -> Unit = {}
) {
    val mood = remember { mutableStateOf("\uD83E\uDD14") }
    val text = remember { mutableStateOf("...") }
    LaunchedEffect(lastCoffee) {
        lastCoffee.collect { diff ->
            if (diff == null) return@collect

            if (diff < 0.seconds) {
                text.value = diff.toFuzzyTime()
                if (diff > (-10).seconds) {
                    mood.value = "\uD83D\uDE06" // Just a little bit more...
                } else if (diff > (-60).seconds) {
                    mood.value = "\uD83D\uDE0B" // Almost there...
                } else {
                    mood.value = "\uD83D\uDE03" // In ___...
                }
            } else {
                if (diff < 1.minutes) {
                    text.value = "now! ☕"
                } else {
                    text.value = diff.toFuzzyTime()
                }

                if (diff < 1.minutes) {
                    mood.value = "\uD83D\uDE01"
                } else if (diff < 3.hours) {
                    mood.value = "\uD83D\uDE03"
                } else if (diff < 4.hours) {
                    mood.value = "\uD83D\uDE10\uFE0F"
                } else if (diff < 6.hours) {
                    mood.value = "☹\uFE0F"
                } else if (diff < 2.days) {
                    mood.value = "\uD83D\uDE26"
                } else {
                    mood.value = "❤\uFE0F\uD83D\uDC80☕\uFE0F"
                }
            }
        }

    }
    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .scale(3f),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Fresh coffee: "+mood.value)
            Spacer(Modifier.height(20.dp))
            Text(text.value)
            Spacer(Modifier.height(20.dp))
            Row {
                Button(onClick = onFresh) {
                    Text("Fresh")
                }
                Spacer(Modifier.width(20.dp))
                Button(onClick = onBrew) {
                    Text("Brew")
                }
            }
        }
    }
}

@Composable
fun HideSystemBars() {
    val context = LocalContext.current

    DisposableEffect(Unit) {
        val window = context.findActivity()?.window ?: return@DisposableEffect onDispose {}
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)

        insetsController.apply {
            hide(WindowInsetsCompat.Type.statusBars())
            hide(WindowInsetsCompat.Type.navigationBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        onDispose {
            insetsController.apply {
                show(WindowInsetsCompat.Type.statusBars())
                show(WindowInsetsCompat.Type.navigationBars())
                systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
            }
        }
    }
}

fun Context.findActivity(): Activity? {
    var context = this
    while (context is ContextWrapper) {
        if (context is Activity) return context
        context = context.baseContext
    }
    return null
}

//TODO: Refactor this for change to lastCoffee -> Flow<T>
//@Preview(showBackground = true,
//    showSystemUi = false,
//    device = "spec:width=600dp,height=1024dp,dpi=420,isRound=false,chinSize=0dp,orientation=landscape"
//)
//@Composable
//fun GreetingPreview() {
//    val lastCoffee = remember { mutableStateOf(kotlinx.datetime.Instant.parse("2000-01-01T01:01:01.001Z"))}
//    CoffeePanelTheme {
//        CoffeeStatus()
//    }
//}