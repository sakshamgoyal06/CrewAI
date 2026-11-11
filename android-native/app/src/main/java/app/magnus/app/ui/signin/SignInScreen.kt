package app.magnus.app.ui.signin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import app.magnus.app.AppGraph
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.magnus.app.ui.theme.Magnus
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(graph: AppGraph) {
    val c = Magnus.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showToken by remember { mutableStateOf(false) }
    var token by remember { mutableStateOf("") }
    // Why the last session ended (e.g. an uninvited Google account), set by the signed-in root.
    val notice by graph.signInNotice.collectAsStateWithLifecycle()

    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Magnus", style = MaterialTheme.typography.displaySmall, color = c.text)
        Text(
            "Your coach for reaching your goal by your date.",
            style = MaterialTheme.typography.bodyLarge, color = c.muted, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.height(40.dp))
        Button(
            onClick = {
                error = null
                graph.signInNotice.value = null
                busy = true
                scope.launch {
                    try {
                        graph.auth.signInWithGoogle(context)
                    } catch (_: GetCredentialCancellationException) {
                        // They closed the account picker: nothing to say.
                    } catch (e: GetCredentialException) {
                        error = "Google sign-in isn't available on this phone right now (${e.type.substringAfterLast('.')})."
                    } catch (e: Exception) {
                        error = e.message ?: "Sign-in failed. Try again."
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy,
            shape = RoundedCornerShape(50),
            colors = ButtonDefaults.buttonColors(containerColor = c.accent, contentColor = c.accentInk),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            if (busy) CircularProgressIndicator(color = c.accentInk, strokeWidth = 2.dp, modifier = Modifier.height(20.dp))
            else Text("Continue with Google", style = MaterialTheme.typography.labelLarge)
        }

        (error ?: notice)?.let {
            Text(it, color = c.bad, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 16.dp))
        }

        Spacer(Modifier.height(24.dp))
        if (!showToken) {
            TextButton(onClick = { showToken = true }) {
                Text("Use an app token instead", color = c.muted, style = MaterialTheme.typography.bodyMedium)
            }
        } else {
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("App token") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )
            TextButton(
                onClick = {
                    if (token.isBlank()) return@TextButton
                    error = null
                    graph.auth.signInWithToken(token)
                },
                modifier = Modifier.padding(top = 4.dp),
            ) { Text("Sign in with token", color = c.accent) }
        }
    }
}
