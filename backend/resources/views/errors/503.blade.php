@extends('errors.layout', ['tone' => 'info'])

@section('code', '503')
@section('title', 'Service momentanément indisponible')
@section('message', 'Le service est en maintenance ou temporairement surchargé.')
@section('hint', 'Réessayez dans quelques minutes.')
@section('actions')
    <a class="primary" href="{{ url()->current() }}">Réessayer</a>
@endsection
