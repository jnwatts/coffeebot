package net.sroz.coffeepanel.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val CoffeeColorScheme = darkColorScheme(
    primary = Coffee,
    background = Color.Black,
    onPrimary = Cream,
    onBackground = Cream
)

@Composable
fun CoffeePanelTheme(
    content: @Composable () -> Unit
) {

    MaterialTheme(
        colorScheme = CoffeeColorScheme,
        typography = Typography,
        content = content
    )
}