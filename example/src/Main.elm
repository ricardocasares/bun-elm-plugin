module Main exposing (main)

import Browser
import Html exposing (Html, button, div, h1, text)
import Html.Attributes exposing (class)
import Html.Events exposing (onClick)
import View


type Msg
    = Inc
    | Dec


main : Program () Int Msg
main =
    Browser.sandbox { init = 0, update = update, view = view }


update : Msg -> Int -> Int
update msg n =
    case msg of
        Inc ->
            n + 1

        Dec ->
            n - 1


view : Int -> Html Msg
view n =
    div [ class "mx-auto mt-16 max-w-sm rounded-2xl bg-white p-8 shadow-lg" ]
        [ h1 [ class "mb-6 text-2xl font-bold tracking-tight" ] [ text "bun-elm-plugin" ]
        , div [ class "flex items-center justify-between gap-4" ]
            [ button [ class "rounded-full bg-slate-200 px-4 py-2 font-mono text-lg hover:bg-slate-300", onClick Dec ] [ text "-" ]
            , View.counter n
            , button [ class "rounded-full bg-slate-200 px-4 py-2 font-mono text-lg hover:bg-slate-300", onClick Inc ] [ text "+" ]
            ]
        ]
