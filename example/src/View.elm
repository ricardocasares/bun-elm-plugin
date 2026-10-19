module View exposing (counter)

import Html exposing (Html, span, text)
import Html.Attributes exposing (class)


counter : Int -> Html msg
counter n =
    span [ class "font-mono text-3xl tabular-nums" ] [ text (String.fromInt n) ]
